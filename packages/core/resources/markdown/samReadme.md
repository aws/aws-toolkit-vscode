# Developing AWS SAM Applications with the ${PRODUCTNAME}

This project contains source code and supporting files for a serverless application that you can locally run, debug, and deploy to ${COMPANYNAME} with the ${PRODUCTNAME}.

A "SAM" (serverless application model) project is a project that contains a template.yaml file which is understood by ${COMPANYNAME} tooling (such as SAM CLI, and the ${PRODUCTNAME}).

## Writing and Debugging Serverless Applications

The code for this application will differ based on the runtime, but the path to a handler can be found in the [`template.yaml`](./template.yaml) file through a resource's `CodeUri` and `Handler` fields.

${PRODUCTNAME} supports local debugging for serverless applications through ${IDE}'s debugger. Since this application was created by the ${COMPANYNAME} Toolkit, launch configurations for all included handlers have been generated and can be found in the menu next to the Run button:
${LISTOFCONFIGURATIONS}

You can debug the Lambda handlers locally by adding a breakpoint to the source file, then running the launch configuration. This works by using Docker on your local machine.

Invocation parameters, including payloads and request parameters, can be edited either by the `Invoke Locally` command (through the ${COMMANDPALETTE} or ${CODELENS}) or by editing the `launch.json` file.

${COMPANYNAME} Lambda functions not defined in the [`template.yaml`](./template.yaml) file can be invoked and debugged by creating a launch configuration through the ${CODELENS} over the function declaration, or with the `Add Local Invoke and Debug Configuration` command.

## Deploying Serverless Applications

You can deploy a serverless application by invoking the `AWS: Deploy SAM application` command through the Command Palette or by right-clicking the Lambda node in the ${COMPANYNAME} Explorer and entering the deployment region, a valid S3 bucket from the region, and the name of a CloudFormation stack to deploy to. You can monitor your deployment's progress through the `${COMPANYNAME} Toolkit` Output Channel.

## Interacting With Deployed Serverless Applications

A successfully-deployed serverless application can be found in the ${COMPANYNAME} Explorer under region and CloudFormation node that the serverless application was deployed to.

In the ${COMPANYNAME} Explorer, you can invoke _remote_ ${COMPANYNAME} Lambda Functions by right-clicking the Lambda node and selecting "Invoke on ${COMPANYNAME}".

Similarly, if the Function declaration contained an API Gateway event, the API Gateway API can be found in the API Gateway node under the region node the serverless application was deployed to, and can be invoked via right-clicking the API node and selecting "Invoke on ${COMPANYNAME}".

## Resources

General information about this SAM project can be found in the [`README.md`](./README.md) file in this folder.

More information about using the ${PRODUCTNAME} with serverless applications can be found [in the ${COMPANYNAME} documentation](${DOCURL}) .
