FROM public.ecr.aws/lambda/nodejs:16

COPY app.js package.json ./

RUN npm install

CMD ["app.lambdaHandler"]
