#!/bin/bash

app_name=${2:= `cat manifest.yml |yq '.applications[0].name'`}


tmp_tar=$(mktemp /tmp/code.XXXXXXXXX)
tar -czf $tmp_tar .
sum=$(md5sum $tmp_tar)
curl -X POST --form "upload=@$tmp_tar" http://localhost:8080/$1/$2/push -H "Content-Type: multipart/form-data"

rm $tmp_tar