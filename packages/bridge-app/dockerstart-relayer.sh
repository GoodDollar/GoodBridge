PWD=`pwd`
docker stop bridgerelay watchtower-relay
docker rm bridgerelay watchtower-relay
docker run -d -e DOTENV_FILE=/config/.env -e LOG_LEVEL=info --name bridgerelay --volume $PWD/relayer:/config --restart=always gooddollar/bridge-app bridge/index.js relayer
docker run -d --name watchtower-relay -v /var/run/docker.sock:/var/run/docker.sock containrrr/watchtower bridgerelay --debug