FROM public.ecr.aws/lambda/nodejs:12

COPY app.js package.json ./

RUN npm install

CMD ["app.lambdaHandler"]
