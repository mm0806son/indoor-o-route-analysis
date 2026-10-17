FROM indoor-o-route-analysis:0804b
RUN mkdir -p /releases && cp -a /usr/share/nginx/html /releases/0804b
COPY site/ /releases/0.2.4/
RUN mkdir -p /shared/_next && cp -a /releases/0804b/_next/static /shared/_next/static && cp -a /releases/0.2.4/_next/static/. /shared/_next/static/
COPY default.conf /etc/nginx/conf.d/default.conf
COPY picker.js /release-picker.js
RUN chmod -R a+rX /releases /shared && chmod a+r /release-picker.js
