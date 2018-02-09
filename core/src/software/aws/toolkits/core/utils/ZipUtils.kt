package software.aws.toolkits.core.utils

import java.nio.file.Files
import java.nio.file.Path
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * Adds a new [ZipEntry] with the contents of [file] to the [ZipOutputStream].
 */
fun ZipOutputStream.putNextEntry(entryName: String, file: Path) {
    this.putNextEntry(ZipEntry(entryName))
    val bytes = Files.readAllBytes(file)
    this.write(bytes, 0, bytes.size)
    this.closeEntry()
}