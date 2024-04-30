VERSION=`cat package.json | jq -r .version`
docker buildx build --platform=linux/arm64,linux/amd64 . --push -t gooddollar/bridge-app
docker tag gooddollar/bridge-app gooddollar/bridge-app:$VERSION
# docker push gooddollar/bridge-app:$VERSION
# docker push gooddollar/bridge-app