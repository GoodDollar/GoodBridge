FROM gcr.io/distroless/nodejs18-debian12
WORKDIR /app
COPY ./distDocker ./bridge

ENV POLLING_INTERVAL=5000
ENV LOG_LEVEL=info
# expecting machine to be a fuse validator
ENV REGISTRY_RPC=http://172.17.0.1:8545
ENV FUSE_RPC=http://172.17.0.1:8545
# ENV OLD_BLOCK_REGISTRY_ADDRESS=0x0602b55F96eC0d347E5123C556272015fFee9fC5
# ENV BLOCK_REGISTRY_ADDRESS=0x44a1E0A83821E239F9Cef248CECc3AC5b910aeD2
ENV CONSENSUS_ADDRESS=0x3014ca10b91cb3D0AD85fEf7A3Cb95BCAc9c0f79
# ENV BRIDGES='[{"122":"0xA20E93475A8DE713DC022c8dC29342D052C605E1","42220":"0x06070B88cd74805779F28035C832a59c68c6227d"},{"122":"0x4f920A22966080d1F34c1D64f1F64fe8ADDB8D5B","42220":"0xDda675C439038B867A015D02363722D9E27Bf5Fe"}]'
ENV TEST_MODE=false
ENV STEP_SIZE=10
ENV CONFIG_DIR=/config/

CMD ["bridge/index.js"]

