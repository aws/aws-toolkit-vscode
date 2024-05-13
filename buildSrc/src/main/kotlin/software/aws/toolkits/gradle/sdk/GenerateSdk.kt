// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.sdk

import org.gradle.api.DefaultTask
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.tasks.InputDirectory
import org.gradle.api.tasks.Internal
import org.gradle.api.tasks.OutputDirectory
import org.gradle.api.tasks.TaskAction
import software.amazon.awssdk.codegen.C2jModels
import software.amazon.awssdk.codegen.CodeGenerator
import software.amazon.awssdk.codegen.model.config.customization.CustomizationConfig
import software.amazon.awssdk.codegen.model.service.ServiceModel
import software.amazon.awssdk.codegen.utils.ModelLoaderUtils
import java.io.File

open class GenerateSdk : DefaultTask() {
    @InputDirectory
    val c2jFolder: DirectoryProperty = project.objects.directoryProperty().convention(project.extensions.getByType(GenerateSdkExtension::class.java).c2jFolder)

    @OutputDirectory
    val srcDir: DirectoryProperty = project.objects.directoryProperty().convention(project.extensions.getByType(GenerateSdkExtension::class.java).srcDir())

    @Internal
    val testDir: DirectoryProperty = project.objects.directoryProperty().convention(project.extensions.getByType(GenerateSdkExtension::class.java).testDir())

    @TaskAction
    fun generate() {
        val srcDir = srcDir.asFile.get()
        val testDir = testDir.asFile.get()
        srcDir.deleteRecursively()
        testDir.deleteRecursively()

        c2jFolder.get().asFileTree.visit {
            if (isDirectory) {
                with(file) {
                    logger.info("Generating SDK from $this")
                    val models = C2jModels.builder()
                        .serviceModel(loadServiceModel())
                        .endpointRuleSetModel(loadOptionalModel("endpoint-rule-set-1.json"))
                        .endpointTestSuiteModel(loadOptionalModel("endpoint-tests-1.json"))
                        .paginatorsModel(loadOptionalModel("paginators-1.json"))
                        .customizationConfig(loadOptionalModel("customization.config") ?: CustomizationConfig.create())
                        .waitersModel(loadOptionalModel("waiters-2.json"))
                        .build()

                    CodeGenerator.builder()
                        .models(models)
                        .sourcesDirectory(srcDir.absolutePath)
                        .testsDirectory(testDir.absolutePath)
                        .build()
                        .execute()
                }
            }
        }
    }

    private fun File.loadServiceModel(): ServiceModel? = ModelLoaderUtils.loadModel(ServiceModel::class.java, resolve("service-2.json"))

    private inline fun <reified T> File.loadOptionalModel(fileName: String): T? = resolve(fileName).takeIf { it.exists() }?.let {
        ModelLoaderUtils.loadModel(T::class.java, it)
    }
}
