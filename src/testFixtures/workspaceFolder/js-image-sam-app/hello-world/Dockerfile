FROM 628053151772.dkr.ecr.sa-east-1.amazonaws.com/awslambda/nodejs12.x-runtime:beta

COPY app.js package.json ./

RUN npm install

# Command can be overwritten by providing a different command in the template directly.
CMD ["app.lambdaHandler"]
