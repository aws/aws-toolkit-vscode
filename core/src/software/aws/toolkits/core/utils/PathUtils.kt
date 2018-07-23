package software.aws.toolkits.core.utils

import java.io.InputStream
import java.nio.charset.Charset
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.FileTime

fun Path.inputStream(): InputStream = Files.newInputStream(this)
fun Path.exists() = Files.exists(this)
fun Path.delete() = Files.delete(this)
fun Path.lastModified(): FileTime = Files.getLastModifiedTime(this)
fun Path.readText(charset: Charset = Charsets.UTF_8) = toFile().readText(charset)
fun Path.writeText(text: String, charset: Charset = Charsets.UTF_8) = toFile().writeText(text, charset)