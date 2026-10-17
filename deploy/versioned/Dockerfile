FROM indoor-o-route-analysis:1017-stairs
COPY site/ /releases/1017-human-route/
RUN cp -a /releases/1017-human-route/_next/static/. /shared/_next/static/
COPY default.conf /etc/nginx/conf.d/default.conf
COPY picker.js /release-picker.js
RUN chmod -R a+rX /releases/1017-human-route /shared && chmod a+r /release-picker.js
