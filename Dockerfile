FROM node:14-alpine

ENV NODE_ENV production

ADD package.json /webapp/
ADD package-lock.json /webapp/
RUN npm install --production

ADD . /webapp

WORKDIR /webapp
CMD node local.js
