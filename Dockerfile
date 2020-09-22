FROM node:12
WORKDIR /app

COPY package*.json ./

RUN npm install
COPY ./dist /app/dist

CMD ["npm","start"]
