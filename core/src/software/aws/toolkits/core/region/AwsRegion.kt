package software.aws.toolkits.core.region

import software.amazon.awssdk.regions.Region

data class AwsRegion(val id: String, val name: String) {
    val category: String? = when {
        id.startsWith("us") -> "North America"
        id.startsWith("ca") -> "North America"
        id.startsWith("eu") -> "Europe"
        id.startsWith("ap") -> "Asia Pacific"
        id.startsWith("sa") -> "South America"
        id.startsWith("cn") -> "China"
        else -> null
    }

    val displayName: String = when {
        category == "Europe" -> "${name.trimPrefixAndRemoveBrackets("EU")} ($id)"
        category == "North America" -> "${name.removePrefix("US West").trimPrefixAndRemoveBrackets("US East")} ($id)"
        category != null && name.startsWith(category) -> "${name.trimPrefixAndRemoveBrackets(category)} ($id)"
        else -> name
    }

    companion object {
        val GLOBAL = AwsRegion(Region.AWS_GLOBAL.id(), "Global")
        private fun String.trimPrefixAndRemoveBrackets(prefix: String) = this.removePrefix(prefix).replace("(", "").replace(")", "").trim()
    }
}