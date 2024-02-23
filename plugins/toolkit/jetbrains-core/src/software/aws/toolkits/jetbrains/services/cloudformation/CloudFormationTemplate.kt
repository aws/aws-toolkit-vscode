// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

import com.intellij.openapi.project.Project
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiElement
import org.jetbrains.yaml.YAMLFileType
import org.jetbrains.yaml.YAMLLanguage
import org.jetbrains.yaml.psi.YAMLSequence
import software.aws.toolkits.jetbrains.services.cloudformation.yaml.YamlCloudFormationTemplate
import software.aws.toolkits.resources.message
import java.io.File

interface CloudFormationTemplate {
    fun resources(): Sequence<Resource>
    fun parameters(): Sequence<Parameter>
    fun globals(): Map<String, NamedMap>

    fun getResourceByName(logicalName: String): Resource? = resources().firstOrNull { it.logicalName == logicalName }

    fun saveTo(file: File) {
        FileUtil.createIfNotExists(file)
        file.writeText(text())
    }

    fun text(): String

    companion object {
        fun parse(project: Project, templateFile: VirtualFile): CloudFormationTemplate = when {
            isYaml(templateFile) -> YamlCloudFormationTemplate(project, templateFile)
            else -> throw UnsupportedOperationException("Only YAML CloudFormation templates are supported")
        }

        fun convertPsiToResource(psiElement: PsiElement): Resource? = when (psiElement.language) {
            YAMLLanguage.INSTANCE -> YamlCloudFormationTemplate.convertPsiToResource(psiElement)
            else -> throw UnsupportedOperationException("Only YAML CloudFormation templates are supported")
        }

        private fun isYaml(templateFile: VirtualFile): Boolean = templateFile.fileType == YAMLFileType.YML ||
            templateFile.extension?.toLowerCase() in YAML_EXTENSIONS

        private val YAML_EXTENSIONS = setOf("yaml", "yml")
    }
}

interface NamedMap {
    val logicalName: String

    fun getScalarProperty(key: String): String
    fun getOptionalScalarProperty(key: String): String?
    fun setScalarProperty(key: String, value: String)
    fun getSequenceProperty(key: String): YAMLSequence
    fun getOptionalSequenceProperty(key: String): YAMLSequence?
}

interface Resource : NamedMap {
    val cloudFormationTemplate: CloudFormationTemplate
    fun isType(requestedType: String): Boolean
    fun type(): String?
    fun getScalarMetadata(key: String): String
    fun getOptionalScalarMetadata(key: String): String?
}

interface Parameter : NamedMap {
    fun defaultValue(): String?
    fun description(): String?
    fun constraintDescription(): String?
}

class CloudFormationParameter(private val delegate: NamedMap) : NamedMap by delegate, Parameter {

    override fun defaultValue(): String? = getOptionalScalarProperty("Default")

    override fun description(): String? = getOptionalScalarProperty("Description")

    override fun constraintDescription(): String? = getOptionalScalarProperty("ConstraintDescription")
}

class MutableParameter(private val copyFrom: Parameter) : Parameter {
    private var defaultValue: String? = copyFrom.defaultValue()
    private val description: String? = copyFrom.description()
    private val constraintDescription: String? = copyFrom.constraintDescription()

    override val logicalName: String
        get() = copyFrom.logicalName

    override fun getScalarProperty(key: String): String {
        throw NotImplementedError()
    }

    override fun getOptionalScalarProperty(key: String): String? {
        throw NotImplementedError()
    }

    override fun setScalarProperty(key: String, value: String) {
        throw NotImplementedError()
    }

    override fun getSequenceProperty(key: String): YAMLSequence {
        throw NotImplementedError()
    }

    override fun getOptionalSequenceProperty(key: String): YAMLSequence? {
        throw NotImplementedError()
    }

    override fun defaultValue(): String? = defaultValue

    override fun description(): String? = description

    override fun constraintDescription(): String? = constraintDescription

    fun setDefaultValue(value: String?) {
        defaultValue = value
    }
}

/**
 * Merge remote parameters from a CloudFormation stack to construct a preferred [Parameter] list.
 *
 * @return The merged preferred [Parameter] list
 */
fun List<Parameter>.mergeRemoteParameters(remoteParameters: List<software.amazon.awssdk.services.cloudformation.model.Parameter>): List<Parameter> =
    this.map { templateParameter ->
        val mutableParameter = MutableParameter(templateParameter)
        remoteParameters.find { it.parameterKey() == templateParameter.logicalName }?.let {
            mutableParameter.setDefaultValue(it.parameterValue())
        }
        mutableParameter
    }.toList()

/**
 * Validate if the cloudformation template has any valid resources at all
 *
 * @param virtualFile SAM template file
 * @return null if there are any valid resources, or an error message otherwise.
 */
fun Project.validateSamTemplateHasResources(virtualFile: VirtualFile): String? {
    val path = virtualFile.path
    CloudFormationTemplateIndex
        .listResources(this, { true }, virtualFile)
        .ifEmpty { return message("serverless.application.deploy.error.no_resources", path) }
    return null
}
