// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws

object CawsConstants {
    const val CAWS_ENV_PROJECT_DIR = "/projects"
    const val CAWS_ENV_IDE_BACKEND_DIR = "/aws/mde/ide-runtimes/jetbrains/runtime/"
    const val DEFAULT_CAWS_ENV_API_ENDPOINT = "http://127.0.0.1:1339"
    const val CAWS_ENV_API_ENDPOINT = "__MDE_ENVIRONMENT_API"
    const val CAWS_ENV_AUTH_TOKEN_VAR = "__MDE_ENV_API_AUTHORIZATION_TOKEN"
    const val CAWS_ENV_ORG_NAME_VAR = "__DEV_ENVIRONMENT_ORGANIZATION_NAME"
    const val CAWS_ENV_PROJECT_NAME_VAR = "__DEV_ENVIRONMENT_PROJECT_NAME"
    const val CAWS_ENV_ID_VAR = "__DEV_ENVIRONMENT_ID"
    const val DEVFILE_YAML_NAME = "devfile.yaml"
}
