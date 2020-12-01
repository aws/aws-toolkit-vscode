FROM mcr.microsoft.com/dotnet/core/sdk:2.1 as build-image
ARG FUNCTION_DIR="/build"
ENV PATH="/root/.dotnet/tools:${PATH}"

RUN apt-get update && apt-get -y install zip

RUN mkdir $FUNCTION_DIR
WORKDIR $FUNCTION_DIR
COPY Function.cs HelloWorld.csproj aws-lambda-tools-defaults.json $FUNCTION_DIR/
RUN dotnet tool install -g Amazon.Lambda.Tools
RUN dotnet lambda package

FROM 628053151772.dkr.ecr.sa-east-1.amazonaws.com/awslambda/dotnetcore2.1-runtime:beta

COPY --from=build-image /build/bin/Release/netcoreapp2.1/publish/ /var/task/

# Command can be overwritten by providing a different command in the template directly.
CMD ["HelloWorld::HelloWorld.Function::FunctionHandler"]
