FROM docker:19.03.1

LABEL runner-executor=docker
LABEL description="A simple docker image for gitlab runner use"

RUN set -x \
      && echo -e "\e[93m==> Adding runtime dependencies...\e[39m" \
      && apk add --no-cache --virtual .run-deps \
              alpine-sdk \
              make \
              zip \
              bash \
              jq \
              py3-pip \
              python3-dev \
              groff \
      \
      && echo -e "\e[93m==> Udpating pip...\e[39m" \
      && pip3 install --upgrade --no-cache-dir pip \
      \
      && echo -e "\e[93m==> Installing awscli...\e[39m" \
      && pip3 install --no-cache-dir awscli \
      \
      && echo -e "\e[93m==> Installing boto3...\e[39m" \
      && pip3 install --no-cache-dir --user boto3