// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.openapi.vfs.VirtualFile
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamInitRunner
import software.aws.toolkits.resources.message

val SAM_TEMPLATES = listOf(SamHelloWorld(), SamDynamoDBCookieCutter())

class SamHelloWorld : SamProjectTemplate() {
    override fun getName() = message("sam.init.template.hello_world.name")

    override fun getDescription() = message("sam.init.template.hello_world.description")
}

class SamDynamoDBCookieCutter : SamProjectTemplate() {
    override fun getName() = message("sam.init.template.dynamodb_cookiecutter.name")

    override fun getDescription() = message("sam.init.template.dynamodb_cookiecutter.description")

    override fun doBuild(runtime: Runtime, outputDir: VirtualFile) {
        SamInitRunner(SamModuleType.ID, outputDir, runtime, "gh:aws-samples/cookiecutter-aws-sam-dynamodb-python").execute()
    }
}