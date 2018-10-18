// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
@file:JvmName("TemplateUtils")

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.util.PsiUtil
import org.jetbrains.yaml.psi.YAMLDocument
import org.jetbrains.yaml.psi.YAMLFile
import org.jetbrains.yaml.psi.YAMLKeyValue
import org.jetbrains.yaml.psi.YAMLMapping
import org.jetbrains.yaml.psi.YAMLPsiElement
import software.aws.toolkits.resources.message
import java.io.File

private const val FUNCTION_TYPE = "AWS::Serverless::Function"

data class SamFunction(
    val logicalName: String,
    val handler: String,
    val runtime: String
) {
    override fun toString() = logicalName
}

fun findSamFunctionsFromTemplate(project: Project, file: File): List<SamFunction> {
    val virtualFile = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file) ?: throw RuntimeException(
        message("lambda.sam.template_not_found", file)
    )
    return findSamFunctionsFromTemplate(project, virtualFile)
}

fun findSamFunctionsFromTemplate(project: Project, file: VirtualFile): List<SamFunction> {
    val yamlFile = PsiUtil.getPsiFile(project, file) as? YAMLFile ?: throw RuntimeException(message("lambda.sam.template_not_yaml", file.path))
    return yamlFile.documents.flatMap {
        it.findResourceByType(FUNCTION_TYPE)
    }.mapNotNull {
        val handler = it.getScalarProperty("Handler") ?: return@mapNotNull null
        val runtime = it.getScalarProperty("Runtime") ?: return@mapNotNull null
        SamFunction(logicalName = it.logicalName, handler = handler, runtime = runtime)
    }
}

fun updateCodeUriForFunctions(file: File, newCodeUri: String) {
    val regex = """CodeUri:.*""".toRegex()
    val content = file.readText()
    file.writeText(regex.replace(content, "CodeUri: $newCodeUri"))
}

fun functionFromElement(element: YAMLPsiElement): SamFunction? {
    val keyValue = element as? YAMLKeyValue ?: return null
    val value = keyValue.value as? YAMLMapping ?: return null
    val type = value.getKeyValueByKey("Type")?.valueText ?: return null
    if (type != FUNCTION_TYPE) {
        return null
    }
    val properties = value.getKeyValueByKey("Properties")?.value as? YAMLMapping ?: return null
    val handler = properties.getKeyValueByKey("Handler")?.valueText ?: return null
    val runtime = properties.getKeyValueByKey("Runtime")?.valueText ?: return null
    return SamFunction(keyValue.keyText, handler, runtime)
}

private fun YAMLDocument.findResourceByType(type: String): List<Resource> {
    val resources = ((this.topLevelValue as? YAMLMapping)?.keyValues?.find { it.keyText == "Resources" }?.value as? YAMLMapping)
        ?: throw RuntimeException(message("template_utils.key_not_found", "Resources", this.containingFile))
    return resources.keyValues.filter { (it.value as? YAMLMapping)?.getKeyValueByKey("Type")?.valueText == type }.map { it.asResource() }
}

private interface Resource {
    val logicalName: String
    fun type(): String
    fun getScalarProperty(key: String): String?
}

private class YamlResource(override val logicalName: String, private val delegate: YAMLMapping) : YAMLMapping by delegate, Resource {
    override fun type(): String = delegate.getKeyValueByKey("Type")?.valueText ?: throw RuntimeException(
        message(
            "template_utils.key_not_found",
            "Type",
            logicalName
        )
    )

    override fun getScalarProperty(key: String): String? = properties().getKeyValueByKey(key)?.valueText
    private fun properties(): YAMLMapping = delegate.getKeyValueByKey("Properties")?.value as? YAMLMapping
        ?: throw RuntimeException(message("template_utils.key_not_found", "Properties", logicalName))
}

private fun YAMLKeyValue.asResource(): Resource = YamlResource(this.keyText, this.value as YAMLMapping)