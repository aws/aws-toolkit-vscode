// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.remoteDev.caws

import com.intellij.openapi.extensions.ExtensionNotApplicableException
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.rd.util.launchChildOnUi
import com.intellij.openapi.rd.util.launchIOBackground
import com.intellij.openapi.rd.util.launchUnderBackgroundProgress
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.util.text.nullize
import com.intellij.util.ui.UIUtil
import com.jetbrains.ide.model.uiautomation.BeAlignment
import com.jetbrains.ide.model.uiautomation.BeControl
import com.jetbrains.ide.model.uiautomation.BeSizingType
import com.jetbrains.ide.model.uiautomation.UpdateSourceTrigger
import com.jetbrains.rd.ui.bedsl.button
import com.jetbrains.rd.ui.bedsl.dsl.combobox
import com.jetbrains.rd.ui.bedsl.dsl.getText
import com.jetbrains.rd.ui.bedsl.dsl.horizontalGrid
import com.jetbrains.rd.ui.bedsl.dsl.label
import com.jetbrains.rd.ui.bedsl.dsl.replaceWith
import com.jetbrains.rd.ui.bedsl.dsl.textBox
import com.jetbrains.rd.ui.bedsl.dsl.util.BeMarginsBuilder
import com.jetbrains.rd.ui.bedsl.dsl.verticalGrid
import com.jetbrains.rd.ui.bedsl.dsl.withColor
import com.jetbrains.rd.ui.bedsl.dsl.withMargin
import com.jetbrains.rd.ui.bedsl.link
import com.jetbrains.rd.util.lifetime.Lifetime
import com.jetbrains.rdserver.unattendedHost.customization.controlCenter.GatewayControlCenterTabProvider
import software.amazon.awssdk.services.codecatalyst.CodeCatalystClient
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.sono.CodeCatalystCredentialManager
import software.aws.toolkits.jetbrains.core.credentials.sono.lazilyGetUserId
import software.aws.toolkits.jetbrains.services.caws.CawsConstants
import software.aws.toolkits.jetbrains.services.caws.InactivityTimeout
import software.aws.toolkits.jetbrains.services.caws.envclient.CawsEnvironmentClient
import software.aws.toolkits.jetbrains.services.caws.isSubscriptionFreeTier
import software.aws.toolkits.jetbrains.services.caws.isSupportedInFreeTier
import software.aws.toolkits.jetbrains.services.caws.loadParameterDescriptions
import software.aws.toolkits.jetbrains.utils.isCodeCatalystDevEnv
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodecatalystTelemetry
import software.aws.toolkits.telemetry.CodecatalystUpdateDevEnvironmentLocationType
import java.nio.file.Path
import java.time.Duration
import software.aws.toolkits.telemetry.Result as TelemetryResult

class UpdateWorkspaceSettingsTab : GatewayControlCenterTabProvider {
    init {
        if (!isCodeCatalystDevEnv()) {
            throw ExtensionNotApplicableException.create()
        }
    }

    private val project: Project by lazy {
        ProjectManager.getInstance().defaultProject
    }

    override val id: String
        get() = "caws.configureWorkspaceTab"
    override val title: String
        get() = message("caws.configure_workspace_tab_title")

    override fun getControl(lifetime: Lifetime): BeControl = verticalGrid {
        row {
            label(message("loading_resource.loading"))
        }
    }.also {
        lifetime.launchIOBackground {
            try {
                val connection = CodeCatalystCredentialManager.getInstance(project).getConnectionSettings()
                    ?: error("Failed to fetch connection settings from Dev Environment")
                val envId = System.getenv(CawsConstants.CAWS_ENV_ID_VAR) ?: error("envId env var null")
                val org = System.getenv(CawsConstants.CAWS_ENV_ORG_NAME_VAR) ?: error("space env var null")
                val projectName = System.getenv(CawsConstants.CAWS_ENV_PROJECT_NAME_VAR) ?: error("project env var null")

                val client = connection.awsClient<CodeCatalystClient>()
                val initialEnv = client.getDevEnvironment {
                    it.id(envId)
                    it.spaceName(org)
                    it.projectName(projectName)
                }

                val isFree = isSubscriptionFreeTier(client, org)

                val alias = textBox(lifetime, false, "caws.development.workspace.alias", UpdateSourceTrigger.TextChanged)
                initialEnv.alias()?.let { alias.text.set(it) }

                val timeout = InactivityTimeout.DEFAULT_VALUES.toList()
                val instanceSize = loadParameterDescriptions().environmentParameters.instanceTypes.keys.let { types ->
                    if (isFree) {
                        types.filter { it.isSupportedInFreeTier() }
                    } else {
                        types
                    }
                }.toList()

                var timeoutSelected = initialEnv.inactivityTimeoutMinutes()
                var instanceSizeSelected = initialEnv.instanceType()

                launchChildOnUi {
                    it.replaceWith(
                        verticalGrid {
                            row {
                                horizontalGrid {
                                    column {
                                        link(message("caws.open.devfile"), lifetime) {
                                            val project = inferActiveProject()
                                            try {
                                                val devfileLocation = CawsEnvironmentClient.getInstance().getStatus().location ?: "devfile.yaml"
                                                // The path returned by getStatus() is relative to /projects
                                                val devfilePath = VirtualFileManager.getInstance().findFileByNioPath(
                                                    Path.of("${CawsConstants.CAWS_ENV_PROJECT_DIR}/$devfileLocation")
                                                )
                                                if (devfilePath != null) {
                                                    FileEditorManager.getInstance(project).openFile(devfilePath, true)
                                                }
                                            } catch (e: Exception) {
                                                val failedToOpenDevfile = message("caws.open.devfile.failed")
                                                LOG.error(e) { failedToOpenDevfile }
                                                notifyError(failedToOpenDevfile, "$failedToOpenDevfile: ${e.message}", project)
                                            }
                                        }
                                    }
                                }
                            }

                            row {
                                horizontalGrid {
                                    column {
                                        label(message("caws.workspace.details.alias.label"))
                                    }
                                    column {
                                        alias
                                    }
                                }
                            }

                            row {
                                horizontalGrid {
                                    column {
                                        label(message("caws.workspace.details.inactivity_timeout"))
                                    }
                                    column {
                                        combobox(
                                            lifetime,
                                            timeout,
                                            selectedValue = InactivityTimeout(Duration.ofMinutes(initialEnv.inactivityTimeoutMinutes().toLong())),
                                            handleSelected = {
                                                timeoutSelected = it.asMinutes()
                                            },
                                            presentation = {
                                                label(it.displayText())
                                            }
                                        )
                                    }
                                }
                            }

                            row {
                                horizontalGrid {
                                    column {
                                        label(message("caws.workspace.instance_size"))
                                    }

                                    column {
                                        combobox(lifetime, instanceSize, selectedValue = initialEnv.instanceType(), handleSelected = {
                                            instanceSizeSelected = it
                                        }, presentation = {
                                            // TODO: Velox to provide API for this info
                                            label(it.toString().substringAfter("dev.standard1.").capitalize())
                                        })
                                    }
                                }
                            }

                            row(BeSizingType.Fit, BeAlignment.Right) {
                                button(message("caws.configure_workspace_tab_save_button"), lifetime) {
                                    lifetime.launchIOBackground buttonAction@{
                                        if (initialEnv.instanceType() == instanceSizeSelected &&
                                            initialEnv.alias().nullize() == alias.getText().nullize() &&
                                            initialEnv.inactivityTimeoutMinutes() == timeoutSelected
                                        ) {
                                            // noop
                                            return@buttonAction
                                        }

                                        var result = TelemetryResult.Succeeded
                                        try {
                                            lifetime.launchUnderBackgroundProgress(message("caws.update_dev_environment")) {
                                                client.updateDevEnvironment {
                                                    it.id(envId)
                                                    it.spaceName(org)
                                                    it.projectName(projectName)

                                                    if (initialEnv.instanceType() != instanceSizeSelected) {
                                                        it.instanceType(instanceSizeSelected)
                                                    }

                                                    if (initialEnv.alias().nullize() != alias.getText().nullize()) {
                                                        it.alias(alias.getText().orEmpty())
                                                    }

                                                    if (initialEnv.inactivityTimeoutMinutes() != timeoutSelected) {
                                                        it.inactivityTimeoutMinutes(timeoutSelected)
                                                    }
                                                }
                                            }.join()
                                        } catch (e: Exception) {
                                            result = TelemetryResult.Failed
                                            val message = message("caws.update_dev_environment.failed")
                                            LOG.error(e) { message }
                                            notifyError(message, e.message ?: message("general.unknown_error"), project = inferActiveProject())
                                        }

                                        CodecatalystTelemetry.updateDevEnvironmentSettings(
                                            project = null,
                                            userId = lazilyGetUserId(),
                                            codecatalystUpdateDevEnvironmentLocationType = CodecatalystUpdateDevEnvironmentLocationType.Remote,
                                            result = result
                                        )
                                    }
                                }
                            }
                        }
                    )
                }
            } catch (e: Exception) {
                LOG.error(e) { "Failed to load control center tab" }
                launchChildOnUi {
                    it.replaceWith(
                        verticalGrid {
                            row {
                                val message = e.message ?: message("general.unknown_error")
                                label(message)
                                    .withColor(UIUtil.getErrorForeground())
                            }
                        }
                    )
                }
            }
        }
    }.withMargin(BeMarginsBuilder().margin(25, 25, 25, 25))

    private fun inferActiveProject() = ProjectManager.getInstance().openProjects.first()

    companion object {
        private val LOG = getLogger<UpdateWorkspaceSettingsTab>()
    }
}
