// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.sdk

import org.gradle.api.DefaultTask
import org.gradle.api.tasks.InputDirectory
import org.gradle.api.tasks.OutputDirectory
import org.gradle.api.tasks.TaskAction
import software.amazon.awssdk.codegen.C2jModels
import software.amazon.awssdk.codegen.CodeGenerator
import software.amazon.awssdk.codegen.model.config.customization.CustomizationConfig
import software.amazon.awssdk.codegen.model.service.Paginators
import software.amazon.awssdk.codegen.model.service.ServiceModel
import software.amazon.awssdk.codegen.utils.ModelLoaderUtils
import java.io.File

open class GenerateSdk : DefaultTask() {
    @InputDirectory
    lateinit var c2jFolder: File

    @OutputDirectory
    lateinit var outputDir: File

    @TaskAction
    fun generate() {
        outputDir.deleteRecursively()

        logger.info("Generating SDK from $c2jFolder")
        val models = C2jModels.builder()
            .serviceModel(loadServiceModel())
            .paginatorsModel(loadPaginatorsModel())
            .customizationConfig(loadCustomizationConfig())
            .build()

        CodeGenerator.builder()
            .models(models)
            .sourcesDirectory(outputDir.absolutePath)
            .build()
            .execute()
    }

    private fun loadServiceModel(): ServiceModel? =
        ModelLoaderUtils.loadModel(ServiceModel::class.java, File(c2jFolder, "service-2.json"))

    private fun loadPaginatorsModel(): Paginators? {
        val paginatorsFile = File(c2jFolder, "paginators-1.json")
        if (paginatorsFile.exists())
            return ModelLoaderUtils.loadModel(Paginators::class.java, paginatorsFile)
        return null
    }

    private fun loadCustomizationConfig(): CustomizationConfig = ModelLoaderUtils.loadOptionalModel(
        CustomizationConfig::class.java,
        File(c2jFolder, "customization.config")
    ).orElse(CustomizationConfig.create())
}
