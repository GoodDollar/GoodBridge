VERSION=`cat package.json | jq -r .version`
docker build . -t gooddollar/bridge-app
docker tag gooddollar/bridge-app gooddollar/bridge-app:$VERSION
docker push gooddollar/bridge-app:$VERSION
docker push gooddollar/bridge-app