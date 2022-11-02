FROM node:16-alpine as build
WORKDIR /app

RUN apk update && \
    apk upgrade && \
    apk add git

COPY ./package.json .
RUN yarn install

COPY ./ ./
RUN yarn build:release
RUN rm -fr node_modules
RUN yarn install --production

FROM gcr.io/distroless/nodejs:16
ENV POLLING_INTERVAL=5000
ENV LOG_LEVEL=info
ENV REGISTRY_RPC=http://172.17.0.1:8545
ENV FUSE_RPC=http://172.17.0.1:8545
ENV OLD_BLOCK_REGISTRY_ADDRESS=0x0602b55F96eC0d347E5123C556272015fFee9fC5
ENV BLOCK_REGISTRY_ADDRESS=0x44a1E0A83821E239F9Cef248CECc3AC5b910aeD2
ENV CONSENSUS_ADDRESS=0x3014ca10b91cb3D0AD85fEf7A3Cb95BCAc9c0f79
ENV TEST_MODE=false
ENV STEP_SIZE=50
ENV CONFIG_DIR=/config/
COPY --from=build /app /app
WORKDIR /app
CMD ["dist/main.js"]

