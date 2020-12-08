FROM mcr.microsoft.com/dotnet/core/sdk:2.1 as build-image
ARG FUNCTION_DIR="/build"
ENV PATH="/root/.dotnet/tools:${PATH}"

RUN apt-get update && apt-get -y install zip

RUN mkdir $FUNCTION_DIR
WORKDIR $FUNCTION_DIR
COPY Function.cs HelloWorld.csproj aws-lambda-tools-defaults.json $FUNCTION_DIR/
RUN dotnet tool install -g Amazon.Lambda.Tools
RUN dotnet lambda package

FROM public.ecr.aws/lambda/dotnet:core2.1

COPY --from=build-image /build/bin/Release/netcoreapp2.1/publish/ /var/task/

# Command can be overwritten by providing a different command in the template directly.
CMD ["HelloWorld::HelloWorld.Function::FunctionHandler"]
