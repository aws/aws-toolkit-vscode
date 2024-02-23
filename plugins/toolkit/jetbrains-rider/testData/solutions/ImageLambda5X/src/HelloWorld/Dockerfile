FROM mcr.microsoft.com/dotnet/sdk:5.0-buster-slim AS build-image

ARG FUNCTION_DIR="/build"
ARG SAM_BUILD_MODE="run"
ENV PATH="/root/.dotnet/tools:${PATH}"

RUN apt-get update && apt-get -y install zip

RUN mkdir $FUNCTION_DIR
WORKDIR $FUNCTION_DIR
COPY Function.cs HelloWorld.csproj $FUNCTION_DIR/
RUN dotnet tool install -g Amazon.Lambda.Tools

# Build and Copy artifacts depending on build mode.
RUN dotnet restore "HelloWorld.csproj"
RUN if [ "$SAM_BUILD_MODE" = "debug" ]; then \
    dotnet publish "HelloWorld.csproj" \
            --configuration Debug \
            --runtime linux-x64 \
            --self-contained false \
            --output /app/publish \
            -p:PublishReadyToRun=true; \
    else \
        dotnet publish "HelloWorld.csproj" \
            --configuration Release \
            --runtime linux-x64 \
            --self-contained false \
            --output /app/publish \
            -p:PublishReadyToRun=true; \
    fi

FROM public.ecr.aws/lambda/dotnet:5.0

COPY --from=build-image /app/publish /var/task/
# Command can be overwritten by providing a different command in the template directly.
CMD ["HelloWorld::EchoLambda.Function::FunctionHandler"]
