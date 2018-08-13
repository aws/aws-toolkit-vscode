package software.aws.toolkits.jetbrains

import com.intellij.ide.plugins.PluginManager
import com.intellij.openapi.extensions.PluginId

object AwsToolkit {
    private const val PLUGIN_ID = "aws.toolkit"

    val PLUGIN_VERSION: String by lazy {
        PluginManager.getPlugin(PluginId.getId(PLUGIN_ID))?.version ?: "Unknown"
    }
}