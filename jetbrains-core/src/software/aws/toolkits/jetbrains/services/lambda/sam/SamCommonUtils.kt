// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.sam

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.runInEdtAndGet
import kotlinx.coroutines.future.await
import kotlinx.coroutines.runBlocking
import org.jetbrains.yaml.YAMLFileType
import software.amazon.awssdk.services.cloudformation.model.StackSummary
import software.aws.toolkits.jetbrains.ToolkitPlaces
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.getExecutable
import software.aws.toolkits.jetbrains.services.cloudformation.Parameter
import software.aws.toolkits.jetbrains.services.cloudformation.validateSamTemplateHasResources
import software.aws.toolkits.jetbrains.ui.KeyValueTextField
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.ui.find
import software.aws.toolkits.resources.message
import java.util.regex.PatternSyntaxException

object SamTemplateFileUtils {
    val templateYamlRegex = Regex("template\\.y[a]?ml", RegexOption.IGNORE_CASE)

    /**
     * Determines the relevant Sam Template, returns null if one can't be found.
     */
    fun getSamTemplateFile(e: AnActionEvent): VirtualFile? = runReadAction {
        val virtualFiles = e.getData(PlatformDataKeys.VIRTUAL_FILE_ARRAY) ?: return@runReadAction null
        val virtualFile = virtualFiles.singleOrNull() ?: return@runReadAction null

        if (templateYamlRegex.matches(virtualFile.name)) {
            return@runReadAction virtualFile
        }

        // If the module node was selected, see if there is a template file in the top level folder
        val module = e.getData(LangDataKeys.MODULE_CONTEXT)
        if (module != null) {
            // It is only acceptable if one template file is found
            val childTemplateFiles = ModuleRootManager.getInstance(module).contentRoots.flatMap { root ->
                root.children.filter { child -> templateYamlRegex.matches(child.name) }
            }

            if (childTemplateFiles.size == 1) {
                return@runReadAction childTemplateFiles.single()
            }
        }

        return@runReadAction null
    }

    fun validateTemplateFile(project: Project, templateFile: VirtualFile): String? =
        try {
            runReadAction {
                project.validateSamTemplateHasResources(templateFile)
            }
        } catch (e: Exception) {
            message("serverless.application.deploy.error.bad_parse", templateFile.path, e)
        }

    fun retrieveSamTemplate(e: AnActionEvent, project: Project): VirtualFile? {
        if (e.place == ToolkitPlaces.EXPLORER_TOOL_WINDOW) {
            return runInEdtAndGet {
                FileChooser.chooseFile(
                    FileChooserDescriptorFactory.createSingleFileDescriptor(YAMLFileType.YML),
                    project,
                    project.guessProjectDir()
                )
            } ?: return null
        } else {
            val file = getSamTemplateFile(e)
            if (file == null) {
                Exception(message("serverless.application.deploy.toast.template_file_failure"))
                    .notifyError(message("aws.notification.title"), project)
                return null
            }
            return file
        }
    }
}

fun getSamCli(): GeneralCommandLine {
    val executable = runBlocking {
        ExecutableManager.getInstance().getExecutable<SamExecutable>().await()
    }

    val samExecutable = when (executable) {
        is ExecutableInstance.Executable -> executable
        else -> {
            throw RuntimeException((executable as? ExecutableInstance.BadExecutable)?.validationError.orEmpty())
        }
    }

    return samExecutable.getCommandLine()
}

object ValidateSamParameters {
    // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-using-console-create-stack-parameters.html
    //  A stack name can contain only alphanumeric characters (case-sensitive) and hyphens. It must start with an alphabetic character and can't be longer than 128 characters.
    private val STACK_NAME_PATTERN = "[a-zA-Z][a-zA-Z0-9-]*".toRegex()
    const val MAX_STACK_NAME_LENGTH = 128
    fun validateStackName(name: String?, availableStacks: ResourceSelector<StackSummary>): String? {
        if (name.isNullOrEmpty()) {
            return message("serverless.application.deploy.validation.new.stack.name.missing")
        }
        if (!STACK_NAME_PATTERN.matches(name)) {
            return message("serverless.application.deploy.validation.new.stack.name.invalid")
        }
        if (name.length > MAX_STACK_NAME_LENGTH) {
            return message("serverless.application.deploy.validation.new.stack.name.too.long", MAX_STACK_NAME_LENGTH)
        }
        // Check if the new stack name is same as an existing stack name
        availableStacks.model.find { it.stackName() == name }?.let {
            return message("serverless.application.deploy.validation.new.stack.name.duplicate")
        }
        return null
    }

    fun validateParameters(parametersComponent: KeyValueTextField, templateFileParameters: List<Parameter>): ValidationInfo? {
        // validate on ui element because value hasn't been committed yet
        val parameters = parametersComponent.envVars
        val parameterDeclarations = templateFileParameters.associateBy { it.logicalName }

        val invalidParameters = parameters.entries.mapNotNull { (name, value) ->
            val cfnParameterDeclaration = parameterDeclarations[name] ?: return ValidationInfo("parameter declared but not in template")
            when (cfnParameterDeclaration.getOptionalScalarProperty("Type")) {
                "String" -> validateStringParameter(name, value, cfnParameterDeclaration)
                "Number" -> validateNumberParameter(name, value, cfnParameterDeclaration)
                // not implemented: List<Number>, CommaDelimitedList, AWS-specific parameters, SSM parameters
                else -> null
            }
        }

        return invalidParameters.firstOrNull()
    }

    private fun validateStringParameter(name: String, providedValue: String?, parameterDeclaration: Parameter): ValidationInfo? {
        val value = providedValue.orEmpty()
        val minValue = parameterDeclaration.getOptionalScalarProperty("MinLength")
        val maxValue = parameterDeclaration.getOptionalScalarProperty("MaxLength")
        val allowedPattern = parameterDeclaration.getOptionalScalarProperty("AllowedPattern")

        minValue?.toIntOrNull()?.let {
            if (value.length < it) {
                return ValidationInfo(message("serverless.application.deploy.validation.template.values.tooShort", name, minValue))
            }
        }

        maxValue?.toIntOrNull()?.let {
            if (value.length > it) {
                return ValidationInfo(message("serverless.application.deploy.validation.template.values.tooLong", name, maxValue))
            }
        }

        allowedPattern?.let {
            try {
                val regex = it.toRegex()
                if (!regex.matches(value)) {
                    return ValidationInfo(message("serverless.application.deploy.validation.template.values.failsRegex", name, regex))
                }
            } catch (e: PatternSyntaxException) {
                return ValidationInfo(message("serverless.application.deploy.validation.template.values.badRegex", name, e.message ?: it))
            }
        }

        return null
    }

    private fun validateNumberParameter(name: String, value: String?, parameterDeclaration: Parameter): ValidationInfo? {
        // cfn numbers can be integer or float. assume real implementation refers to java floats
        val number = value?.toFloatOrNull()
            ?: return ValidationInfo(message("serverless.application.deploy.validation.template.values.notANumber", name, value.orEmpty()))
        val minValue = parameterDeclaration.getOptionalScalarProperty("MinValue")
        val maxValue = parameterDeclaration.getOptionalScalarProperty("MaxValue")

        minValue?.toFloatOrNull()?.let {
            if (number < it) {
                return ValidationInfo(message("serverless.application.deploy.validation.template.values.tooSmall", name, minValue))
            }
        }

        maxValue?.toFloatOrNull()?.let {
            if (number > it) {
                return ValidationInfo(message("serverless.application.deploy.validation.template.values.tooBig", name, maxValue))
            }
        }

        return null
    }
}
