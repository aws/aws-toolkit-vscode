package com.amazonaws.intellij.ui.explorer

import com.amazonaws.services.s3.AmazonS3
import com.amazonaws.services.s3.model.Bucket
import com.amazonaws.services.s3.model.ListObjectsV2Request
import com.amazonaws.services.s3.model.Owner
import com.intellij.openapi.application.ApplicationManager
import java.awt.GridLayout
import java.text.SimpleDateFormat
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.JTable
import javax.swing.table.DefaultTableModel
import javax.swing.table.TableModel

class S3BucketDetailController(private val s3: AmazonS3, private val view: S3BucketDetailView) {
    private val format = SimpleDateFormat("EEE, d MMM yyyy HH:mm:ss z")
    private val columns = listOf("Key", "Etag", "Size", "Owner", "Modified", "Storage Class")

    fun update(bucket: Bucket) {
        view.updateBucketSummary(bucket.owner.str() ?: "", if (bucket.creationDate != null) format.format(bucket.creationDate) else "")
        view.updateObjectList("Loading...")

        ApplicationManager.getApplication().invokeLater {
            val req = ListObjectsV2Request().withBucketName(bucket.name).withMaxKeys(50)
            val objArray = s3.listObjectsV2(req).objectSummaries.filter{it.key != null}.map { obj ->
                val modified = if (obj.lastModified != null) format.format(obj.lastModified) else ""
                val size = obj.size.toString()
                val etag = obj.eTag ?: ""
                val owner = obj.owner.str() ?: bucket.owner.str() ?: ""
                val storageClass = obj.storageClass ?: ""
                listOf<String>(obj.key, etag, size, owner, modified, storageClass)
            }
            view.updateObjectList(objArray, columns)
        }
    }
}

class S3BucketDetailView() : JPanel(GridLayout(2, 1)) {
    private val owner = JLabel()
    private val createDate = JLabel()
    private val objects = JTable()

    init {
        val bucketDetail = JPanel(GridLayout(2, 2))
        bucketDetail.add(JLabel("Owner:"))
        bucketDetail.add(owner)
        bucketDetail.add(JLabel("Creation Date:"))
        bucketDetail.add(createDate)
        add(bucketDetail)
        objects.model = singleElementModel("")
        add(JScrollPane(objects))
    }

    fun updateBucketSummary(owner: String, createDate: String) {
        this.owner.text = owner
        this.createDate.text = createDate
    }

    fun updateObjectList(data: Iterable<Iterable<String>>, columns: Iterable<String>) {
        objects.model = DefaultTableModel(data.map { it.toList().toTypedArray() }.toTypedArray(), columns.toList().toTypedArray())
    }

    fun updateObjectList(singleValue: String) {
        objects.model = singleElementModel(singleValue)
    }

    private fun singleElementModel(value:String): TableModel {
        return DefaultTableModel(Array<Array<String>>(1) { Array<String>(1) { value } }, Array<String>(1) { "" })
    }
}

fun Owner?.str(): String? {
    return this?.displayName ?: this?.id
}
