PWD=`pwd`
docker stop bridgeapp watchtower
docker rm bridgeapp watchtower
docker run -d -e DOTENV_FILE=/config/.env -e LOG_LEVEL=info --name bridgeapp --volume $PWD/fusenet/config:/config --restart=always gooddollar/bridge-app
docker run -d --name watchtower -v /var/run/docker.sock:/var/run/docker.sock containrrr/watchtower bridgeapp --debug