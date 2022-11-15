VERSION=`cat package.json | jq -r .version`
docker tag gooddollar/bridge-app gooddollar/bridge-app:$VERSION
docker push gooddollar/bridge-app:$VERSION
docker push gooddollar/bridge-app