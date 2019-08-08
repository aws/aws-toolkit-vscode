// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation.yaml

import com.intellij.openapi.project.Project
import com.intellij.openapi.util.text.StringUtil
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFileFactory
import com.intellij.psi.util.PsiTreeUtil
import org.jetbrains.yaml.YAMLElementGenerator
import org.jetbrains.yaml.YAMLLanguage
import org.jetbrains.yaml.psi.YAMLFile
import org.jetbrains.yaml.psi.YAMLKeyValue
import org.jetbrains.yaml.psi.YAMLMapping
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationParameter
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplate
import software.aws.toolkits.jetbrains.services.cloudformation.NamedMap
import software.aws.toolkits.jetbrains.services.cloudformation.Parameter
import software.aws.toolkits.jetbrains.services.cloudformation.RESOURCE_MAPPINGS
import software.aws.toolkits.jetbrains.services.cloudformation.Resource
import software.aws.toolkits.resources.message

class YamlCloudFormationTemplate(template: YAMLFile) : CloudFormationTemplate {
    constructor(project: Project, templateFile: VirtualFile) : this(loadYamlFile(project, templateFile))

    private val templateRoot = getTemplateRoot(template)

    private fun getTemplateRoot(file: YAMLFile): YAMLMapping? {
        val documents = file.documents
        if (documents.size != 1) {
            LOG.debug { message("cloudformation.yaml.too_many_documents", file) }
            return null
        }

        val topLevelValue = documents[0].topLevelValue
        return if (topLevelValue is YAMLMapping) {
            topLevelValue
        } else {
            LOG.debug { message("cloudformation.yaml.invalid_root_type", file) }
            null
        }
    }

    override fun resources(): Sequence<Resource> {
        val resourcesBlock = templateRoot?.getKeyValueByKey("Resources") ?: return emptySequence()
        val resources = PsiTreeUtil.findChildOfAnyType(resourcesBlock, YAMLMapping::class.java) ?: return emptySequence()
        return resources.keyValues.asSequence().mapNotNull { it.asResource(this) }
    }

    override fun parameters(): Sequence<Parameter> {
        val parametersBlock = templateRoot?.getKeyValueByKey("Parameters") ?: return emptySequence()
        val parameters = PsiTreeUtil.findChildOfAnyType(parametersBlock, YAMLMapping::class.java) ?: return emptySequence()
        return parameters.keyValues.asSequence().mapNotNull { it.asProperty() }
    }

    override fun globals(): Map<String, NamedMap> {
        val globalsBlock = templateRoot?.getKeyValueByKey("Globals") ?: return emptyMap()
        val globals = PsiTreeUtil.findChildOfAnyType(globalsBlock, YAMLMapping::class.java) ?: return emptyMap()
        return globals.keyValues.asSequence().mapNotNull { yamlKeyValue -> yamlKeyValue.asGlobal()?.let { Pair(it.logicalName, it) } }.toMap()
    }

    override fun text(): String = templateRoot?.text ?: "<invalid>"

    private class YamlGlobal(override val logicalName: String, private val delegate: YAMLMapping) :
        YAMLMapping by delegate, NamedMap {
        override fun getScalarProperty(key: String): String =
            getOptionalScalarProperty(key)
                ?: throw IllegalStateException(message("cloudformation.missing_property", key, logicalName))

        override fun getOptionalScalarProperty(key: String): String? = delegate.getKeyValueByKey(key)?.valueText

        override fun setScalarProperty(key: String, value: String) {
            throw NotImplementedError()
        }
    }

    private class YamlResource(
        override val logicalName: String,
        override val cloudFormationTemplate: CloudFormationTemplate,
        private val delegate: YAMLMapping
    ) : YAMLMapping by delegate, Resource {
        override fun isType(requestedType: String): Boolean = try {
            type() == requestedType
        } catch (_: Exception) {
            false
        }

        override fun type(): String? = delegate.getKeyValueByKey("Type")?.valueText

        override fun getScalarProperty(key: String): String = getOptionalScalarProperty(key)
            ?: throw IllegalStateException(message("cloudformation.missing_property", key, logicalName))

        override fun getOptionalScalarProperty(key: String): String? = properties().getKeyValueByKey(key)?.valueText

        override fun setScalarProperty(key: String, value: String) {
            val newKeyValue = YAMLElementGenerator.getInstance(project).createYamlKeyValue(key, value)
            properties().putKeyValue(newKeyValue)
        }

        private fun properties(): YAMLMapping = delegate.getKeyValueByKey("Properties")?.value as? YAMLMapping
            ?: throw RuntimeException(message("cloudformation.key_not_found", "Properties", logicalName))
    }

    private class YamlCloudFormationParameter(override val logicalName: String, private val delegate: YAMLMapping) :
        YAMLMapping by delegate, NamedMap {
        override fun getScalarProperty(key: String): String = getOptionalScalarProperty(key)
            ?: throw IllegalStateException(message("cloudformation.missing_property", key, logicalName))

        override fun getOptionalScalarProperty(key: String): String? = delegate.getKeyValueByKey(key)?.valueText

        override fun setScalarProperty(key: String, value: String) {
            throw NotImplementedError()
        }
    }

    companion object {
        private val LOG = getLogger<YamlCloudFormationTemplate>()

        private fun loadYamlFile(project: Project, templateFile: VirtualFile): YAMLFile =
            PsiFileFactory.getInstance(project).createFileFromText(
                "template_temp.yaml",
                YAMLLanguage.INSTANCE,
                StringUtil.convertLineSeparators(VfsUtil.loadText(templateFile)),
                false,
                false,
                true
            ) as YAMLFile

        fun convertPsiToResource(psiElement: PsiElement): Resource? {
            val yamlKeyValue = psiElement as? YAMLKeyValue ?: return null
            return yamlKeyValue.asResource(YamlCloudFormationTemplate(yamlKeyValue.containingFile as YAMLFile))
        }

        private fun YAMLKeyValue.asResource(cloudFormationTemplate: CloudFormationTemplate): Resource? {
            if (PsiTreeUtil.getParentOfType(this, YAMLKeyValue::class.java)?.keyText == "Resources") {
                val yamlValue = this.value as? YAMLMapping ?: return null
                val lowLevelResource = YamlResource(this.keyText, cloudFormationTemplate, yamlValue)
                return RESOURCE_MAPPINGS[lowLevelResource.type()]?.invoke(lowLevelResource) ?: lowLevelResource
            }
            return null
        }

        private fun YAMLKeyValue.asProperty(): Parameter? =
            if (PsiTreeUtil.getParentOfType(this, YAMLKeyValue::class.java)?.keyText == "Parameters") {
                val lowLevelParameter = YamlCloudFormationParameter(this.keyText, this.value as YAMLMapping)
                CloudFormationParameter(lowLevelParameter)
            } else {
                null
            }

        private fun YAMLKeyValue.asGlobal(): NamedMap? =
            if (PsiTreeUtil.getParentOfType(this, YAMLKeyValue::class.java)?.keyText == "Globals") {
                YamlGlobal(this.keyText, this.value as YAMLMapping)
            } else {
                null
            }
    }
}