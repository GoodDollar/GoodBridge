VERSION=`cat package.json | jq -r .version`
docker buildx build --platform=linux/arm64,linux/amd64 . --push -t gooddollar/bridge-app
docker buildx imagetools create --tag gooddollar/bridge-app:$VERSION gooddollar/bridge-app
# docker push gooddollar/bridge-app:$VERSION
# docker push gooddollar/bridge-app