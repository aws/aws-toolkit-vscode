// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.resources.message

val SAM_TEMPLATES = listOf(
    SamHelloWorld(),
    SamHelloWorldMaven(),
//    SamHelloWorldGradle(), Broken in SAM 0.13.0 https://github.com/awslabs/aws-sam-cli/pull/1060
    SamDynamoDBCookieCutter()
)

class SamHelloWorld : SamProjectTemplate() {
    override fun getName() = message("sam.init.template.hello_world.name")

    override fun getDescription() = message("sam.init.template.hello_world.description")

    override fun unsupportedRuntimes() = setOf(Runtime.JAVA8)
}

class SamHelloWorldMaven : SamProjectTemplate() {
    override fun getName() = message("sam.init.template.hello_world_maven.name")

    override fun getDescription() = message("sam.init.template.hello_world.description")

    override fun supportedRuntimes() = setOf(Runtime.JAVA8)

    override fun dependencyManager(): String? = "maven"
}

class SamHelloWorldGradle : SamProjectTemplate() {
    override fun getName() = message("sam.init.template.hello_world_gradle.name")

    override fun getDescription() = message("sam.init.template.hello_world.description")

    override fun supportedRuntimes() = setOf(Runtime.JAVA8)

    override fun dependencyManager(): String? = "gradle"
}

class SamDynamoDBCookieCutter : SamProjectTemplate() {
    override fun getName() = message("sam.init.template.dynamodb_cookiecutter.name")

    override fun getDescription() = message("sam.init.template.dynamodb_cookiecutter.description")

    override fun supportedRuntimes() = setOf(Runtime.PYTHON2_7, Runtime.PYTHON3_6, Runtime.PYTHON3_7)

    override fun location(): String? = "gh:aws-samples/cookiecutter-aws-sam-dynamodb-python"
}