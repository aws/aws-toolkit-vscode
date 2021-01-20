FROM mcr.microsoft.com/dotnet/sdk:5.0-buster-slim AS build-image

ARG FUNCTION_DIR="/build"
ARG SAM_BUILD_MODE="run"
ENV PATH="/root/.dotnet/tools:${PATH}"

RUN apt-get update && apt-get -y install zip

RUN mkdir $FUNCTION_DIR
WORKDIR $FUNCTION_DIR
COPY Function.cs HelloWorld.csproj aws-lambda-tools-defaults.json $FUNCTION_DIR/
RUN dotnet tool install -g Amazon.Lambda.Tools

# Build and Copy artifacts depending on build mode.
RUN mkdir -p build_artifacts
RUN if [ "$SAM_BUILD_MODE" = "debug" ]; then dotnet lambda package --configuration Debug; else dotnet lambda package --configuration Release; fi
RUN if [ "$SAM_BUILD_MODE" = "debug" ]; then cp -r /build/bin/Debug/net5.0/publish/* /build/build_artifacts; else cp -r /build/bin/Release/net5.0/publish/* /build/build_artifacts; fi

FROM public.ecr.aws/lambda/dotnet:5.0

COPY --from=build-image /build/build_artifacts/ /var/task/
CMD ["HelloWorld::HelloWorld.Function::FunctionHandler"]
