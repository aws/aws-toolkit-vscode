# Developing AWS SAM Applications with the ${PRODUCTNAME}

This project contains source code and supporting files for a serverless application that you can locally run, debug, and deploy to AWS with the ${PRODUCTNAME}.

## Writing and Debugging Serverless Applications

The code for this application will differ based on the runtime, but the path to a handler can be found in the [`template.yaml`](./template.yaml) file through a resource's `CodeUri` and `Handler` fields.

The ${PRODUCTNAME} supports quick local debugging for serverless applications through ${IDE}'s debug functionality. Since this serverless application was created through the Toolkit, all included handlers are generated with launch configurations, which can be found through the dropdown next to the Run button:
${LISTOFCONFIGURATIONS}

These can be invoked locally by running the configurations, and can be debugged if breakpoints are added to the source files. Invocation parameters, including payloads and request parameters, can be edited by either using the `SAM Debug Configuration Editor` (through the ${COMMANDPALETTE} or ${CODELENS}) or by directly editing the `launch.json` file containing the launch configurations.

Functions that haven't been added to the [`template.yaml`](./template.yaml) file can also be directly invoked and debugged by creating a launch configuration through the ${CODELENS} over the function declaration, for quick debugging prior to committing the function to the SAM template.

## Deploying Serverless Applications

You can deploy a serverless application by invoking the `AWS: Deploy SAM application` command through the Command Palette or by right-clicking the Lambda node in the ${COMPANYNAME} Explorer and entering the deployment region, a valid S3 bucket from the region, and the name of a CloudFormation stack to deploy to. You can monitor your deployment's progress through the **${COMPANYNAME} Toolkit\*\* Output Channel.

## Interacting With Deployed Serverless Applications

A successfully-deployed serverless application can be found in the ${COMPANYNAME} Explorer under region and CloudFormation node that the serverless application was deployed to.

Lambda Functions tied to the serverless application can be invoked by right-clicking the Lambda node and selecting "Invoke on AWS".

Similarly, if the Function declaration contained an API Gateway event, the API Gateway API can be found in the API Gateway node under the region node the serverless application was deployed to.

## Resources

General information about this SAM project can be found in the [`README.md`](./README.md) file in this folder.

More information about using the ${PRODUCTNAME} with serverless applications can be found [in the ${COMPANYNAME} documentation](${DOCURL}) .
