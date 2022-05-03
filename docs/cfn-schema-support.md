# CloudFormation Schema support

This document provides information on how to fix issues with the CloudFormation JSON schemas.

Schema support is provided by the [goformation](https://github.com/awslabs/goformation) project!

## Potential Issues

### Missing Policy in SAMPolicyTemplate

Since the SAM schema is manually maintained, sometimes new policies will not be in the SAMPolicyTemplate of the JSON schema. Similar to issues: [#2250](https://github.com/aws/aws-toolkit-vscode/issues/2250), [#2018](https://github.com/aws/aws-toolkit-vscode/issues/2018), [#2502](https://github.com/aws/aws-toolkit-vscode/issues/2502)

In order to diagnose these issues, you first need to make sure that those policies aren’t in the schema. Download and search through the [sam schema](https://github.com/awslabs/goformation/blob/master/schema/sam.schema.json) and look for “**AWS::Serverless::Function.SAMPolicyTemplate**”. Under the “properties” field try and find whatever policy is missing.

-   If the policy is missing then clone the [goformation](https://github.com/awslabs/goformation) project, add the policy under “**AWS::Serverless::Function.SAMPolicyTemplate**” in [sam-2016-10-31.json](https://github.com/awslabs/goformation/blob/master/generate/sam-2016-10-31.json) and run `go generate` at the root of the repository. This will generate the sam.schema.json that we pull into aws-toolkit-vscode. See PRs: [#450](https://github.com/awslabs/goformation/pull/450), [#448](https://github.com/awslabs/goformation/pull/448), [#449](https://github.com/awslabs/goformation/pull/449) for examples
-   If the policy is not missing then verify that the reference ($ref) it points to in the JSON schema is whatever type the AWS documentation says.
    -   E.g. If a user is having problems with LambdaInvokePolicy
        -   Find the AWS documentation for that policy: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-policy-template-list.html#lambda-invoke-policy
        -   Verify that the schema has the same "Resource" properties as the documentation
            -   If the "Resource" properties are different, you might need to add a new field to the JSON schema according to the specs of the AWS documentation and have the policy point to that in the JSON Schema. Similiar to [this change](https://github.com/awslabs/goformation/pull/449/files#diff-f6615b52e8a9fb8465ba150df1fdba3ce3ce7a262a43fa2e5c5f0d4057c09456R1669).
            -   If the "Resource" properties are the same as the documentation then it should be validating correctly. If you are absolutely sure that the YAML is correct according to the documentation and the schema isn't the issue then raise an issue on [VSCode-YAML](https://github.com/redhat-developer/vscode-yaml)

### Incorrect type

Ocassionally we will get incorrect type issues like:

```
Incorrect type. Expected "string".yaml-schema: file://.../globalStorage/amazonwebservices.aws-toolkit-vscode/sam.schema.json
```

when the YAML looks like it's correct. These issues are hard to diagnose because it means the yaml that was entered isn’t what vscode-yaml/yaml-language-server expects. This can happen for multiple reasons.

1. The yaml is syntatically valid but not semantically valid (according to the schema)

    - In this case, visit the AWS documentation and make sure what was entered makes sense (type wise) according to the [documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-reference.html).
        - E.g. If you have:
            ```yaml
            Type: AWS::Serverless::Function
            Properties:
                Policies: false
            ```
        - The reason why we are getting incorrect type is because Policies is an array not a boolean: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-policy-templates.html
        - If the schema differs from the documentation then the schema will need to be updated to be fully compatible with the documentation

2. The yaml is semantically valid (according to the documentation), then we need to verify that the schema is causing the issue.
    - In most cases, the reason why this issue is occuring is that sometimes the yaml-language-server gets confused when it sees an “anyOf” property in JSON Schema. If it can’t match one of the objects in the “anyOf” field then it defaults to the "best matched" object of the "anyOf", which is why you will often see an error with a completely different type then what you might have expected.
        - To fix this, you must update the JSON schema type of whatever property you are trying to use. You may need to add in any additional properties that are missing in order for the JSON schema to validate correctly against your input. E.g. [#1974](https://github.com/aws/aws-toolkit-vscode/issues/1974) which was fixed by PR: [#454](https://github.com/awslabs/goformation/pull/454)

### Different SAM top level field then CloudFormation

SAM may include a different top-level field that isn’t reflected in vanilla CloudFormation, e.g. the Globals field. These issues are fixed on a more case by case basis, but a good example of how to make these changes is [PR #376](https://github.com/awslabs/goformation/pull/376/files/a8b0539e97cdf0317db296081ffe1366ac81e1ba..970aedd1e112c115deedf337e08a6986976fbca0); this specifically includes the following:

-   [Codegen logic for the template file](https://github.com/awslabs/goformation/pull/376/files/a8b0539e97cdf0317db296081ffe1366ac81e1ba..970aedd1e112c115deedf337e08a6986976fbca0#diff-93ca24b95462b748796b1d282a95b6f34c00d337206306213f1f2ea077433bc0)
    -   [Template for individual global resources in the JSON schema output](https://github.com/awslabs/goformation/pull/376/files/a8b0539e97cdf0317db296081ffe1366ac81e1ba..970aedd1e112c115deedf337e08a6986976fbca0#diff-c1046c4c38a1955cb65d50eb68f8cb70bf8aa27f8e13c956c324301b057440a1)
    -   [Addition to template for JSON schema output to show Global field](https://github.com/awslabs/goformation/pull/376/files/a8b0539e97cdf0317db296081ffe1366ac81e1ba..970aedd1e112c115deedf337e08a6986976fbca0#diff-e06ee27ca655eea7ec8c31cc799dd10a41ceb406872e6723d7bab694dafd94b4)
-   Codegen logic for Golang files/structs
    -   [Adding to main codegen logic](https://github.com/awslabs/goformation/pull/376/files/a8b0539e97cdf0317db296081ffe1366ac81e1ba..970aedd1e112c115deedf337e08a6986976fbca0#diff-39a24c8d3907e38beb5e39b5f0a40df7aa73c38449615f140ec3fca502900e86)
    -   [Global-specific codegen logic](https://github.com/awslabs/goformation/pull/376/files/a8b0539e97cdf0317db296081ffe1366ac81e1ba..970aedd1e112c115deedf337e08a6986976fbca0#diff-5e3f5b10090037982a9d9947a741636746316ed8209f828671538a0492e0726d)
    -   [Addition to common codegen template (for all generated files)](https://github.com/awslabs/goformation/pull/376/files/a8b0539e97cdf0317db296081ffe1366ac81e1ba..970aedd1e112c115deedf337e08a6986976fbca0#diff-e8030b09bcabfce0cfb011a6579d52dfc4683d796b1c66c749863615e282e726)
    -   [Global-specific codegen output](https://github.com/awslabs/goformation/pull/376/files/a8b0539e97cdf0317db296081ffe1366ac81e1ba..970aedd1e112c115deedf337e08a6986976fbca0#diff-74e75f10422a4acaafd087a76a3dbdcd91f897ef9948d02f056ed2a704eb118e)

## Verifying that your schema fix works

In order to verify that the schema change works, we can bypass the aws-toolkit-vscode extension and rely directly on VSCode-YAML. First, create a new empty folder in VSCode. Create a new file called test.yaml and then copy sam.schema.json that was created from your changes in the goformation package into the same folder. Then, associate the schema to your yaml file by adding:

```json
"yaml.schemas": {
    "sam.schema.json": "test.yaml"
}
```

into your VSCode settings. Then open up test.yaml and you should get autocompletion, validation, etc. Now, verify that your change successfully worked by adding the yaml that was previously causing the issue and verify that the problem is no longer occuring.
