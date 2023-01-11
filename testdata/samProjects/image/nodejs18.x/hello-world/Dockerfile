FROM public.ecr.aws/lambda/nodejs:18

COPY app.js package.json ./

RUN npm install

CMD ["app.lambdaHandler"]
