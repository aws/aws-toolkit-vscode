FROM public.ecr.aws/docker/library/golang:[GoVersion] as build-image

ENV GOPROXY direct

WORKDIR /go/src
COPY go.mod main.go ./

RUN go mod tidy
RUN go build -o ../bin

FROM public.ecr.aws/lambda/go:1

COPY --from=build-image /go/bin/ /var/task/

# Command can be overwritten by providing a different command in the template directly.
CMD ["hello-world"]

# NOTE this is flat because of VGO mapping
