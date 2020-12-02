FROM amd64/maven as build-image

WORKDIR "/task"
COPY src/ src/
COPY pom.xml ./

RUN mvn -q clean install
RUN mvn dependency:copy-dependencies -DincludeScope=compile

FROM public.ecr.aws/lambda/java:8

COPY --from=build-image /task/target/classes /var/task/
COPY --from=build-image /task/target/dependency /var/task/lib

CMD ["App::handleRequest"]
