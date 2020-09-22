import express from 'express'
import multiparty from 'multiparty'
import axios from 'axios'
import WebSocket from 'ws'
const Minio = require( 'minio')


const S3_HOST = process.env.S3_HOST ||'192.168.1.11'
const S3_PORT = process.env.S3_PORT|| 9000
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY||'AKIAIOSFODNN7EXAMPLE'
const S3_SECRET_KEY = process.env.S3_SECRET_KEY||'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
const S3_BUCKET = process.env.S3_BUCKET||'code'

const TEKTON_URL = process.env.TEKTON_URL||'http://trigger.192.168.1.10.xip.io'
const LOKI_WS_BASE_URL = process.env.LOKI_WS_BASE_URL||'ws://loki.192.168.1.10.xip.io'


var minioClient = new Minio.Client({
    endPoint: S3_HOST,
    port: S3_PORT,
    useSSL: false,
    accessKey: S3_ACCESS_KEY,
    secretKey: S3_SECRET_KEY
})

const app = express()


const fireTektonTrigger = async (namespace, appname, filename)=>{
  return axios.post(TEKTON_URL, {
    namespace,
    appname,
    filename
  })
}



app.head('/:namespace/:appname/:sum', (req, res)=>{
  const {namespace, appname, sum} = req.params

  //TODO: use MD5 for filename
  minioClient.statObject(S3_BUCKET, `${namespace}/${appname}/code.tgz`).then((stat)=>{
    console.log(stat)
    if(stat.etag == sum)
      res.sendStatus(200)
    else 
      res.sendStatus(409)
  }).catch((err)=>{
    res.statusCode(500)
  })
})

app.post('/:namespace/:appname/push', (req, res)=>{
  const {namespace, appname} = req.params
  // TODO check auth: can push?
  var form = new multiparty.Form()

  form.on('part', function(part) {
    if (!part.filename) {
      console.log('got field named ' + part.name)
      part.resume()
      return
    }

    console.log('pushing object ')
    minioClient.putObject(S3_BUCKET, `${namespace}/${appname}/code.tgz`, part)
      .then(()=>{
        console.log('firing trigger ')
        return fireTektonTrigger(namespace,appname,'code.tgz')
      }).then(({data})=>{
        console.log('got data ')
        res.send(data)
      }).catch((error)=>{
        console.error('got error 1:',error)
        res.status(500).send(error)
      })
  })
  form.on('error',(error)=>{
    console.error('got error 2:',error)
    res.status(500).send(error)
  })

  form.parse(req)
})

app.get('/build/:build_id/log', (req, res)=>{
  const {build_id} = req.params
  const tail_url = `${LOKI_WS_BASE_URL}/loki/api/v1/tail?query={triggers_tekton_dev_triggers_eventid="${build_id}"}`
  const ws = new WebSocket(tail_url)

  ws.on('open', ()=>{
    res.write('Logging: \n')
  })

  ws.on('message',(data)=>{
    const {streams} = JSON.parse(data)
    streams.forEach(({values,stream})=>{
      res.write(`${stream.tekton_dev_pipelineTask}:${stream.container}: ${values[0][1]} \n`)
    })
  })

  ws.on('close',()=>{
      res.end('Logs ending')
  })

  ws.on('error',(error)=>{
    console.warn(error)
    res.end('Logs Error')
  })
  //TODO: end cleanly. How to know when? Maybe check CRDs?
  // Should this all push to smarter client?
  req.socket.on("error", function() {
    ws.close()
  })
  res.socket.on("error", function() {
    ws.close()
  })
})

app.listen('8080')