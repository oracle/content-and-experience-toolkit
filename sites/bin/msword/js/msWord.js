/**
 * Copyright (c) 2020 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
/* global console, __dirname */
/* jshint esversion: 8 */

const SMRT_CNT_ITEM_REPO = "repoId";
const SMRT_CNT_ITEM_FIELD = "ciField";
const SMRT_CNT_ITEM_NAME = "ciName";
const SMRT_CNT_ITEM_DESC = "ciDesc";
const SMRT_CNT_TYPE_NAME = "ctName";

const BKMRK_REF = "bkmrk_ref_";

const CNT_ITEM_NAME = "cnt_item_name";
const CNT_ITEM_DESC = "cnt_item_desc";

const VAL_REPO = "repo";
const VAL_TITLE = "title";
const VAL_NAME = "name";
const VAL_DESC = "description";

const TAG_CNT_TYPE = "ctp=";
const TAG_FIELD_NAME = "fld=";
const TAG_DATA_TYPE = "dtp=";
const TAG_FUNCTION = "fct=";

const IMG_PATH_ASSET_START = "[!--$CEC_DIGITAL_ASSET--]";
const IMG_PATH_ASSET_END = "[/!--$CEC_DIGITAL_ASSET--]";

var fs = require('fs'),
	gulp = require('gulp'),
	path = require('path'),
	zip = require('gulp-zip');

const Utils = require('./utils.js');

const files = require('./files.js');
const Files = new files();

const CONSTANTS = require('./constants.js');

const {
	DOMParser,
	XMLSerializer
} = require('xmldom');

// MS Word (OOXML)

class MSWord {

	constructor() {

		this.parent = null;
		this.main = null;
		this.data = null;
		this.fileSel = null;
		this.bkmrk = 1;
	}

	init(main) {
		//  this.parent = parent;
		this.main = main;
	}

	exportData(info) {
		this.data = info;
		this.data.images = ['png'];
		this.data.destFld = this.main.destFld;
		this.data.templateName = this.main.templateName;
		this.bkmrk = 1;
		return this.createTemplateCopy();
	}

	importData() {
		this.data = {};
		this.data.parser = new DOMParser();
		this.data.references = [];
		this.data.xmlRootFld = this.main.xmlRootFld;
		return this.getContentItemInfo().then(function (result) {
			// console.log(' - get content item info');
			return (result);
		});
	}

	createTemplateCopy() {

		if (this.data) {

			// Copy the template
			let name = this.data.templateName || this.data.contentTypeName;
			if (Object.prototype.hasOwnProperty.call(this.data, "contentItemName") &&
				this.data.contentItemName) {
				name = this.data.contentItemName;
			}
			name = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
			const tmplCopy = Utils.appendToPath(this.main.rootTmpDir, name);
			Files.copyFolderSync(Utils.appendToPath(this.main.extensionPath, "cntItmWrdTmplt"),
				tmplCopy);

			// Init parser
			this.data.parser = new DOMParser();
			this.data.xmlRootFld = tmplCopy;

			// Update type
			if (!this.data.exportType) {
				const p = this.updateExportTypeToContentType(tmplCopy);
				p.then(() => {
						// Create content parts based on the fields
						return this.updateTemplateParts(name, tmplCopy);
					})
					.then(() => {
						// Create zip
						this.createWordArchive();
					});
			} else {
				// Create content parts based on the fields
				this.updateTemplateParts(name, tmplCopy)
					.then(() => {
						// Create zip
						this.createWordArchive();
					});
			}
		}

	}

	updateTemplateParts(name, rootFld) {

		return new Promise((resolve, reject) => {

			const docXml = Utils.appendToPathArray(rootFld, ["word", "document.xml"]);

			// $.get(docXml, {}, (xml) => {
			var xml = fs.readFileSync(docXml).toString();
			// console.log(xml);

			let content = xml;
			var xmlDoc = this.data.parser.parseFromString(content, "text/xml");

			var elements = xmlDoc.getElementsByTagName("w:body");
			if (elements.length) {

				this.updateWordPartsPriv(xmlDoc, elements, this.data)
					.then(() => {

						var serializer = new XMLSerializer();

						content = serializer.serializeToString(xmlDoc);
						// console.log(content.substr(content.length - 50, content.length));

						this.data.createArchive = true;
						this.data.fileName = name;

						// Update document.xml
						const params = {
							filePath: docXml,
							content: content
						};
						console.log(' - saving file: ' + docXml);
						fs.writeFileSync(docXml, content);
						resolve();
						// return Files.writeFileFromStreamAsIsP(params);
						// return Files.writeFileAsIsP(docXml, content);
					})
					.then(() => {
						resolve();
					})
					.catch((err) => {
						console.log(err);
						resolve();
					});
			}
			//  });

		});
	}

	async updateWordPartsPriv(xmlDoc, elements, cData) {

		if (cData.frmBase) {
			await this.updateWordPartsPrivFrm(xmlDoc, elements, cData);
		} else {
			await this.updateWordPartsPrivTbl(xmlDoc, elements, cData);
		}
	}

	updateWordPartsPrivFrm(xmlDoc, elements, cData) {
		// Create a form based template
		return new Promise((resolve, reject) => {

			// Smart tag (repo)
			const fieldRepo = {
				datatype: VAL_REPO,
				description: "",
				name: cData.repoID,
				stName: SMRT_CNT_ITEM_REPO
			};
			let st = this.addSmartTag(xmlDoc, fieldRepo, SMRT_CNT_ITEM_REPO);
			if (st) elements[0].appendChild(st);

			// Smart tag (title)
			const fieldCT = {
				datatype: VAL_TITLE,
				description: "",
				name: cData.contentTypeName,
				stName: SMRT_CNT_TYPE_NAME
			};
			st = this.addSmartTag(xmlDoc, fieldCT, SMRT_CNT_TYPE_NAME);
			if (st) elements[0].appendChild(st);
			// Bookmark
			if (cData.bookmark) {
				const bks = this.addBookmark(xmlDoc, cData.bookmark);
				bks.forEach(bk => elements[0].appendChild(bk));
			}
			// Title
			const titleNode = this.addTitleNode(xmlDoc,
				cData.exportType ? cData.contentTypeName : cData.contentItemName,
				cData.bookmark && cData.bookmark.length,
				cData.repoID, cData.contentTypeName);
			elements[0].appendChild(titleNode);

			// New line
			let nl = this.addNewLineNode(xmlDoc);
			if (nl !== null) elements[0].appendChild(nl);

			let h1Node, part, fieldTitle, fieldNote;
			if (cData.exportType) {
				// Properties
				h1Node = this.addHeadingNode(xmlDoc, "1", "Content Item Properties");
				elements[0].appendChild(h1Node);

				// Content Item Name
				const fieldName = {
					datatype: VAL_NAME,
					description: "Name",
					name: CNT_ITEM_NAME,
					stName: SMRT_CNT_ITEM_NAME,
					ctName: cData.contentTypeName
				};

				let fieldTitle = this.addHeadingNode(xmlDoc, "2", fieldName.description);
				if (fieldTitle !== null) elements[0].appendChild(fieldTitle);
				// Value
				part = this.addPartDotNode(xmlDoc, fieldName);
				if (part !== null) elements[0].appendChild(part);
				// Note
				let fieldNote = this.addPartNoteNode(xmlDoc, fieldName);
				if (fieldNote !== null) elements[0].appendChild(fieldNote);

				nl = this.addNewLineNode(xmlDoc);
				if (nl !== null) elements[0].appendChild(nl);

				// Content Item Description
				const fieldDesc = {
					datatype: VAL_DESC,
					description: "Description (optional)",
					name: CNT_ITEM_DESC,
					stName: SMRT_CNT_ITEM_DESC,
					ctName: cData.contentTypeName
				};

				fieldTitle = this.addHeadingNode(xmlDoc, "2", fieldDesc.description);
				if (fieldTitle !== null) elements[0].appendChild(fieldTitle);
				// Value
				part = this.addPartDotNode(xmlDoc, fieldDesc);
				if (part !== null) elements[0].appendChild(part);
				// Note
				fieldNote = this.addPartNoteNode(xmlDoc, fieldDesc);
				if (fieldNote !== null) elements[0].appendChild(fieldNote);

				nl = this.addNewLineNode(xmlDoc);
				if (nl !== null) elements[0].appendChild(nl);

				// Properties
				h1Node = this.addHeadingNode(xmlDoc, "1", "Content Item Data Fields");
				elements[0].appendChild(h1Node);

				nl = this.addNewLineNode(xmlDoc);
				if (nl !== null) elements[0].appendChild(nl);
			}

			// Fields
			const otherReferences = [];

			// Enum all fields and insert xml data
			if (cData.exportType) {
				// console.log(cData.fields);
				cData.fields.forEach(field => {
					// // Smart tag
					// st = this.addSmartTag(xmlDoc, field, SMRT_CNT_ITEM_FIELD);
					// if (st) elements[0].appendChild(st);
					field.stName = SMRT_CNT_ITEM_FIELD;
					field.ctName = cData.contentTypeName;
					// Add field name
					const fname = field.description + "*";
					fieldTitle = this.addHeadingNode(xmlDoc, "2", fname);
					if (fieldTitle !== null) elements[0].appendChild(fieldTitle);
					// Field
					part = this.addPartDotNode(xmlDoc, field);
					if (part !== null) elements[0].appendChild(part);
					// Note
					fieldNote = this.addPartNoteNode(xmlDoc, field);
					if (fieldNote !== null) elements[0].appendChild(fieldNote);
					// New line
					nl = this.addNewLineNode(xmlDoc, field);
					if (nl !== null) elements[0].appendChild(nl);
					// Other references
					if (field.datatype.toLowerCase() === 'reference' &&
						field.referenceType && field.referenceType.toLowerCase() !== "digitalasset" &&
						field.referenceFields.length) {
						const bkName = this.getBookmarkReference(part);
						otherReferences.push({
							exportType: true,
							repoID: cData.repoID,
							contentTypeName: field.referenceType,
							fields: field.referenceFields,
							bookmark: bkName
						});
					}
				});

				if (otherReferences.length === 0) {
					resolve();
				} else {
					// Add the reference
					// const np = this.addNewPageNode(xmlDoc);
					// if (np !== null) elements[0].appendChild(np);                 
					this.updateWordPartsPriv(xmlDoc, elements, otherReferences.shift())
						.then(result => {
							resolve();
						});
				}
			} else {
				const result = cData.fields.reduce((accumulatePromise, field) => {
					return accumulatePromise.then(() => {
						return this.writeDocFieldInfoFrm(xmlDoc, elements, field);
					});
				}, Promise.resolve());

				result.then(e => {
					resolve();
				});
			}
		});
	}

	updateWordPartsPrivTbl(xmlDoc, elements, cData) {
		// Create a table based template
		return new Promise((resolve, reject) => {
			// Create all elements before inserting them in the table
			const nodes = []; // {lbl: null, sdt: null, note: null}
			let fieldTitle = null;
			let part = null;
			let fieldNote = null;

			// Header
			const hdrField = this.addHeadingNode(xmlDoc, "1", "Field");
			const hdrValue = this.addHeadingNode(xmlDoc, "1", "Value");
			const hdrNote = this.addHeadingNode(xmlDoc, "1", "Note");
			nodes.push({
				lbl: hdrField,
				sdt: hdrValue,
				note: hdrNote
			});

			if (cData.exportType) {
				// Content Item Name
				const fieldName = {
					datatype: VAL_NAME,
					description: "Name",
					name: CNT_ITEM_NAME,
					stName: SMRT_CNT_ITEM_NAME,
					ctName: cData.contentTypeName
				};
				fieldTitle = this.addHeadingNode(xmlDoc, "2", fieldName.description);
				// Value
				part = this.addPartDotNode(xmlDoc, fieldName);
				// Note
				fieldNote = this.addPartNoteNode(xmlDoc, fieldName);
				nodes.push({
					lbl: fieldTitle,
					sdt: part,
					note: fieldNote
				});
				// Content Item Description
				const fieldDesc = {
					datatype: VAL_DESC,
					description: "Description (optional)",
					name: CNT_ITEM_DESC,
					stName: SMRT_CNT_ITEM_DESC,
					ctName: cData.contentTypeName
				};
				fieldTitle = this.addHeadingNode(xmlDoc, "2", fieldDesc.description);
				// Value
				part = this.addPartDotNode(xmlDoc, fieldDesc);
				// Note
				fieldNote = this.addPartNoteNode(xmlDoc, fieldDesc);
				nodes.push({
					lbl: fieldTitle,
					sdt: part,
					note: fieldNote
				});
			}

			const otherReferences = [];

			// Enum all fields and insert xml data
			if (cData.exportType) {

				cData.fields.forEach(field => {
					field.stName = SMRT_CNT_ITEM_FIELD;
					field.ctName = cData.contentTypeName;
					// Add field name
					const fname = field.description + "*";
					fieldTitle = this.addHeadingNode(xmlDoc, "2", fname);
					// Field
					part = this.addPartDotNode(xmlDoc, field);
					// Note
					fieldNote = this.addPartNoteNode(xmlDoc, field);
					nodes.push({
						lbl: fieldTitle,
						sdt: part,
						note: fieldNote
					});
					// Other references
					if (field.datatype.toLowerCase() === 'reference' &&
						field.referenceType && field.referenceType.toLowerCase() !== "digitalasset" &&
						field.referenceFields.length) {
						const bkName = this.getBookmarkReference(part);
						otherReferences.push({
							exportType: true,
							repoID: cData.repoID,
							contentTypeName: field.referenceType,
							fields: field.referenceFields,
							bookmark: bkName
						});
					}
				});

				if (otherReferences.length === 0) {
					this.addFieldsToTable(xmlDoc, elements, nodes, true)
						.then(result => {
							resolve();
						});
				} else {
					// Add the reference
					this.updateWordPartsPriv(xmlDoc, elements, otherReferences.shift())
						.then(result => {
							return this.addFieldsToTable(xmlDoc, elements, nodes, true);
						})
						.then(result => {
							resolve();
						});
				}
			} else {
				// Item name
				const fieldName = {
					datatype: "text",
					description: "Name",
					name: CNT_ITEM_NAME,
					stName: SMRT_CNT_ITEM_NAME,
					ctName: cData.contentTypeName,
					value: cData.contentItemName
				};

				const result = cData.fields.reduce((accumulatePromise, field) => {
					return accumulatePromise.then(() => {
						return this.writeDocFieldInfoTbl(xmlDoc, nodes, field);
					});
				}, Promise.resolve());

				result.then(e => {
						return this.addPartDocTextNode(xmlDoc, fieldName);
					})
					.then(result => {
						const part = result[0];
						const fieldTitle = this.addHeadingNode(xmlDoc, "2", fieldName.description);
						nodes.splice(1, 0, {
							lbl: fieldTitle,
							sdt: part,
							note: null
						});
						// Fields                
						return this.addFieldsToTable(xmlDoc, elements, nodes, false);
					})
					.then(result => {
						resolve();
					});
			}
		});
	}

	addFieldsToTable(xmlDoc, elements, nodes, isTemplate = true) {

		return new Promise((resolve, reject) => {
			// Table
			const tblProps = {
				cols: {
					w: []
				}
			};
			if (isTemplate) {
				tblProps.cols.w.push(965);
				tblProps.cols.w.push(3983);
				tblProps.cols.w.push(4403);
			} else {
				tblProps.cols.w.push(2000);
				tblProps.cols.w.push(7000);
			}
			const tbl = this.createTable(xmlDoc, tblProps);
			if (tbl) {
				// Enum rows
				nodes.forEach((node, idx) => {
					const rowNode = this.createTableRow(xmlDoc, tblProps, node, idx === 0);
					if (rowNode) tbl.appendChild(rowNode);
				});
				elements[0].appendChild(tbl);
			}
			resolve();
		});
	}

	writeDocFieldInfoFrm(xmlDoc, elements, field) {

		return new Promise((resolve, reject) => {

			this.addPartDocNode(xmlDoc, field)
				.then(result => {

					const parts = result;
					// Add field name
					const fname = field.description;
					const fieldTitle = this.addHeadingNode(xmlDoc, "2", fname);
					if (fieldTitle !== null) {
						elements[0].appendChild(fieldTitle);
					}
					// Value
					if (parts.length) {
						parts.forEach(part => {
							elements[0].appendChild(part);
						});
					}
					// New line
					const nl = this.addNewLineNode(xmlDoc, field);
					if (nl !== null) {
						elements[0].appendChild(nl);
					}

					resolve();
				});
		});
	}

	writeDocFieldInfoTbl(xmlDoc, nodes, field) {

		return new Promise((resolve, reject) => {

			this.addPartDocNode(xmlDoc, field)
				.then(result => {

					// Value
					const parts = result;
					// Add field name
					const fname = field.description;
					const fieldTitle = this.addHeadingNode(xmlDoc, "2", fname);
					const note = {
						datatype: "empty"
					};
					const fieldNote = this.addPartNoteNode(xmlDoc, note);
					nodes.push({
						lbl: fieldTitle,
						sdt: parts[0],
						note: fieldNote
					});

					resolve();
				});
		});
	}

	addPartDotNode(xmlDoc, field) {
		if (field.datatype.toLowerCase() === 'name') { // Content item name
			field.placeholder = "Enter content item name";
			return this.addPartDotTextNode(xmlDoc, field);
		} else if (field.datatype.toLowerCase() === 'description') { // Content item description
			field.placeholder = "Enter content item description";
			return this.addPartDotTextNode(xmlDoc, field);
		} else if (field.datatype.toLowerCase() === 'text') {
			field.placeholder = "Enter text";
			return this.addPartDotTextNode(xmlDoc, field);
		} else if (field.datatype.toLowerCase() === 'largetext') {
			field.placeholder = "Enter text";
			return this.addPartDotLargeTextNode(xmlDoc, field);
		} else if (field.datatype.toLowerCase() === 'boolean') {
			if (field.settings.type === "boolean-switch") {
				return this.addPartDotDropdownNode(xmlDoc, field);
			} else {
				return this.addPartDotCheckboxNode(xmlDoc, field);
			}
		} else if (field.datatype.toLowerCase() === 'datetime') {
			return this.addPartDotDatetimeNode(xmlDoc, field);
		} else if (field.datatype.toLowerCase() === 'number') {
			field.placeholder = "Enter number";
			return this.addPartDotTextNode(xmlDoc, field);
		} else if (field.datatype.toLowerCase() === 'decimal') {
			field.placeholder = "Enter number";
			return this.addPartDotTextNode(xmlDoc, field);
		} else if (field.datatype.toLowerCase() === 'reference') {
			if (field.referenceType && field.referenceType.toLowerCase() === "digitalasset") {
				if (field.settings.options.mediaTypes.length === 1 &&
					field.settings.options.mediaTypes[0].toLowerCase() === 'images') {
					field.datatype = CONSTANTS.CNT_DATA_TYPE_RIMG;
					return this.addPartDotImageNode(xmlDoc, field);
				} else {
					field.placeholder = "Enter path to the media file";
					field.datatype = CONSTANTS.CNT_DATA_TYPE_RPTH;
					return this.addPartDotTextNode(xmlDoc, field);
				}
			} else {
				// Content type - add link
				field.datatype = CONSTANTS.CNT_DATA_TYPE_RITM;
				return this.addPartDotLinkNode(xmlDoc, field);
			}
		}

		return null;
	}

	addPartDotTextNode(xmlDoc, field) {
		const sdtNode = xmlDoc.createElement("w:sdt");

		const sdtPrNode = xmlDoc.createElement("w:sdtPr");
		const sdtidNode = xmlDoc.createElement("w:id");
		sdtidNode.setAttribute("w:val", "795418403");
		sdtPrNode.appendChild(sdtidNode);

		const sdtalNode = xmlDoc.createElement("w:alias");
		sdtalNode.setAttribute("w:val", field.description);
		sdtPrNode.appendChild(sdtalNode);

		const sdttgNode = xmlDoc.createElement("w:tag");
		sdttgNode.setAttribute("w:val", this.setFieldTag(field));
		sdtPrNode.appendChild(sdttgNode);

		const sdtLkNode = xmlDoc.createElement("w:lock");
		sdtLkNode.setAttribute("w:val", "stdLocked");
		sdtPrNode.appendChild(sdtLkNode);

		const plchldNode = xmlDoc.createElement("w:placeholder");
		const docPartNode = xmlDoc.createElement("w:docPart");
		const uuid = this.getNewID();
		this.updateStyle(uuid, this.data.xmlRootFld);
		docPartNode.setAttribute("w:val", uuid);
		// docPartNode.setAttribute("w:val", "60CC3BB06F4B4D45AE28ED1E52086934");
		plchldNode.appendChild(docPartNode);
		sdtPrNode.appendChild(plchldNode);

		const plhdrNode = xmlDoc.createElement("w:showingPlcHdr");
		sdtPrNode.appendChild(plhdrNode);

		const txtNode = xmlDoc.createElement("w:text");
		sdtPrNode.appendChild(txtNode);
		sdtNode.appendChild(sdtPrNode);

		const sdtCntNode = xmlDoc.createElement("w:sdtContent");

		const sdtpNode = xmlDoc.createElement("w:p");
		sdtpNode.setAttribute("w:rsidR", "00FF4430");
		sdtpNode.setAttribute("w:rsidRPr", "00FF4430");
		sdtpNode.setAttribute("w:rsidRDefault", "00FF4430");
		sdtpNode.setAttribute("w:rsidP", "00FF4430");

		const sdtrNode = xmlDoc.createElement("w:r");
		sdtrNode.setAttribute("w:rsidRPr", "00FF4430");

		const sdtrprNode = xmlDoc.createElement("w:rPr");

		const sdtrsNode = xmlDoc.createElement("w:rStyle");
		sdtrsNode.setAttribute("w:val", "PlaceholderText");
		sdtrprNode.appendChild(sdtrsNode);
		const sdtbrdNode = xmlDoc.createElement("w:bdr");
		sdtbrdNode.setAttribute("w:val", "single");
		sdtbrdNode.setAttribute("w:sz", "4");
		sdtbrdNode.setAttribute("w:space", "0");
		sdtbrdNode.setAttribute("w:color", "auto");
		sdtrprNode.appendChild(sdtbrdNode);

		sdtrNode.appendChild(sdtrprNode);

		const sdttNode = xmlDoc.createElement("w:t");
		sdttNode.textContent = field.placeholder;
		sdtrNode.appendChild(sdttNode);
		sdtpNode.appendChild(sdtrNode);

		sdtCntNode.appendChild(sdtpNode);

		sdtNode.appendChild(sdtCntNode);

		return sdtNode;
	}

	addPartDotLargeTextNode(xmlDoc, field) {
		const sdtNode = xmlDoc.createElement("w:sdt");

		const sdtPrNode = xmlDoc.createElement("w:sdtPr");

		const sdtalNode = xmlDoc.createElement("w:alias");
		sdtalNode.setAttribute("w:val", field.description);
		sdtPrNode.appendChild(sdtalNode);

		const sdttgNode = xmlDoc.createElement("w:tag");
		sdttgNode.setAttribute("w:val", this.setFieldTag(field));
		sdtPrNode.appendChild(sdttgNode);

		const sdtidNode = xmlDoc.createElement("w:id");
		sdtidNode.setAttribute("w:val", "-507523223");
		sdtPrNode.appendChild(sdtidNode);

		const plchldNode = xmlDoc.createElement("w:placeholder");
		const docPartNode = xmlDoc.createElement("w:docPart");
		docPartNode.setAttribute("w:val", "DefaultPlaceholder_-1854013440");
		plchldNode.appendChild(docPartNode);
		sdtPrNode.appendChild(plchldNode);

		const sdtLkNode = xmlDoc.createElement("w:lock");
		sdtLkNode.setAttribute("w:val", "stdLocked");
		sdtPrNode.appendChild(sdtLkNode);

		const splNode = xmlDoc.createElement("w:showingPlcHdr");
		sdtPrNode.appendChild(splNode);
		sdtNode.appendChild(sdtPrNode);

		const sdtCntNode = xmlDoc.createElement("w:sdtContent");
		const sdtpNode = xmlDoc.createElement("w:p");
		sdtpNode.setAttribute("w:rsidR", "00FF4430");
		sdtpNode.setAttribute("w:rsidRPr", "00FF4430");
		sdtpNode.setAttribute("w:rsidRDefault", "00FF4430");
		sdtpNode.setAttribute("w:rsidP", "00FF4430");

		const sdtrNode = xmlDoc.createElement("w:r");
		sdtrNode.setAttribute("w:rsidRPr", "00230297");
		const sdtrprNode = xmlDoc.createElement("w:rPr");
		const sdtrsNode = xmlDoc.createElement("w:rStyle");
		sdtrsNode.setAttribute("w:val", "PlaceholderText");
		sdtrprNode.appendChild(sdtrsNode);
		sdtrNode.appendChild(sdtrprNode);

		const sdttNode = xmlDoc.createElement("w:t");
		sdttNode.textContent = field.placeholder;
		sdtrNode.appendChild(sdttNode);
		sdtpNode.appendChild(sdtrNode);

		sdtCntNode.appendChild(sdtpNode);

		sdtNode.appendChild(sdtCntNode);

		return sdtNode;
	}

	addPartDotDropdownNode(xmlDoc, field) {
		const sdtNode = xmlDoc.createElement("w:sdt");

		const sdtPrNode = xmlDoc.createElement("w:sdtPr");
		const sdtalNode = xmlDoc.createElement("w:alias");
		sdtalNode.setAttribute("w:val", field.description);
		sdtPrNode.appendChild(sdtalNode);

		const sdttagNode = xmlDoc.createElement("w:tag");
		sdttagNode.setAttribute("w:val", this.setFieldTag(field));
		sdtPrNode.appendChild(sdttagNode);

		const sdtidNode = xmlDoc.createElement("w:id");
		sdtidNode.setAttribute("w:val", "111023378");
		sdtPrNode.appendChild(sdtidNode);

		const plchldNode = xmlDoc.createElement("w:placeholder");
		const docPartNode = xmlDoc.createElement("w:docPart");
		docPartNode.setAttribute("w:val", "3971EDD673D24375AC6DB8F422F011DA");
		plchldNode.appendChild(docPartNode);
		sdtPrNode.appendChild(plchldNode);

		const shwPlhNode = xmlDoc.createElement("w:showingPlcHdr");
		sdtPrNode.appendChild(shwPlhNode);

		const drpdwnNode = xmlDoc.createElement("w:dropDownList");
		let liPartNode = xmlDoc.createElement("w:listItem");
		liPartNode.setAttribute("w:displayText", field.settings.options.labelOn);
		liPartNode.setAttribute("w:value", "True");
		drpdwnNode.appendChild(liPartNode);
		liPartNode = xmlDoc.createElement("w:listItem");
		liPartNode.setAttribute("w:displayText", field.settings.options.labelOff);
		liPartNode.setAttribute("w:value", "False");
		drpdwnNode.appendChild(liPartNode);
		sdtPrNode.appendChild(drpdwnNode);

		sdtNode.appendChild(sdtPrNode);

		const eprNode = xmlDoc.createElement("w:sdtEndPr");
		sdtNode.appendChild(eprNode);

		const sdtCntNode = xmlDoc.createElement("w:sdtContent");
		const sdtpNode = xmlDoc.createElement("w:p");
		sdtpNode.setAttribute("w14:paraId", "4A866518");
		sdtpNode.setAttribute("w14:textId", "77777777");
		sdtpNode.setAttribute("w:rsidR", "002678AD");
		sdtpNode.setAttribute("w:rsidRDefault", "002678AD");
		sdtpNode.setAttribute("w:rsidP", "00B06BF8");

		const sdtrNode = xmlDoc.createElement("w:r");
		const sdttNode = xmlDoc.createElement("w:t");
		sdttNode.textContent = field.defaultValue ? field.defaultValue === true ? field.settings.options.labelOn : field.settings.options.labelOff : "Choose a value";
		sdtrNode.appendChild(sdttNode);
		sdtpNode.appendChild(sdtrNode);

		sdtCntNode.appendChild(sdtpNode);

		sdtNode.appendChild(sdtCntNode);

		return sdtNode;
	}

	addPartDotCheckboxNode(xmlDoc, field) {

		const pNode = xmlDoc.createElement("w:p");
		pNode.setAttribute("w:rsidR", "00992013");
		pNode.setAttribute("w:rsidRDefault", "00260808");
		pNode.setAttribute("w:rsidP", "00B06BF8");

		const sdtNode = xmlDoc.createElement("w:sdt");

		let sdtPrNode = xmlDoc.createElement("w:sdtPr");
		const sdtalNode = xmlDoc.createElement("w:alias");
		sdtalNode.setAttribute("w:val", field.description);
		sdtPrNode.appendChild(sdtalNode);

		const sdttagNode = xmlDoc.createElement("w:tag");
		sdttagNode.setAttribute("w:val", this.setFieldTag(field));
		sdtPrNode.appendChild(sdttagNode);

		const sdtidNode = xmlDoc.createElement("w:id");
		sdtidNode.setAttribute("w:val", "819851127");
		sdtPrNode.appendChild(sdtidNode);

		const chkNode = xmlDoc.createElement("w14:checkbox");
		const chkValNode = xmlDoc.createElement("w14:checked");
		chkValNode.setAttribute("w14:val", field.defaultValue === true);
		chkNode.appendChild(chkValNode);
		let chkStNode = xmlDoc.createElement("w14:checkedState");
		chkStNode.setAttribute("w14:val", "2612");
		chkStNode.setAttribute("w14:font", "MS Gothic");
		chkNode.appendChild(chkStNode);
		chkStNode = xmlDoc.createElement("w14:uncheckedState");
		chkStNode.setAttribute("w14:val", "2610");
		chkStNode.setAttribute("w14:font", "MS Gothic");
		chkNode.appendChild(chkStNode);
		sdtPrNode.appendChild(chkNode);

		sdtNode.appendChild(sdtPrNode);

		sdtPrNode = xmlDoc.createElement("w:sdtEndPr");
		sdtNode.appendChild(sdtPrNode);

		const sdtCntNode = xmlDoc.createElement("w:sdtContent");

		const sdtrNode = xmlDoc.createElement("w:r");
		sdtrNode.setAttribute("w:rsidR", "00967E4F");

		const sdtrPrNode = xmlDoc.createElement("w:rPr");
		const sdtrStNode = xmlDoc.createElement("w:rFonts");
		sdtrStNode.setAttribute("w:ascii", "MS Gothic");
		sdtrStNode.setAttribute("w:eastAsia", "MS Gothic");
		sdtrStNode.setAttribute("w:hAnsi", "MS Gothic");
		sdtrStNode.setAttribute("w:hint", "eastAsia");
		sdtrPrNode.appendChild(sdtrStNode);
		sdtrNode.appendChild(sdtrPrNode);

		const sdttNode = xmlDoc.createElement("w:t");
		sdttNode.textContent = field.defaultValue === true ? "☒" : "☐";
		sdtrNode.appendChild(sdttNode);

		sdtCntNode.appendChild(sdtrNode);

		sdtNode.appendChild(sdtCntNode);

		pNode.appendChild(sdtNode);

		const rNode = xmlDoc.createElement("w:r");
		rNode.setAttribute("w:space", "preserve");

		const tNode = xmlDoc.createElement("w:t");
		tNode.textContent = "   " + field.settings.options.label;
		rNode.appendChild(tNode);
		pNode.appendChild(rNode);

		return pNode;
	}

	addPartDotDatetimeNode(xmlDoc, field) {
		const sdtNode = xmlDoc.createElement("w:sdt");

		const sdtPrNode = xmlDoc.createElement("w:sdtPr");
		let sdtpcNode = xmlDoc.createElement("w:id");
		sdtpcNode.setAttribute("w:val", "-1000969280");
		sdtPrNode.appendChild(sdtpcNode);

		sdtpcNode = xmlDoc.createElement("w:alias");
		sdtpcNode.setAttribute("w:val", field.description);
		sdtPrNode.appendChild(sdtpcNode);

		sdtpcNode = xmlDoc.createElement("w:tag");
		sdtpcNode.setAttribute("w:val", this.setFieldTag(field));
		sdtPrNode.appendChild(sdtpcNode);

		const sdtLkNode = xmlDoc.createElement("w:lock");
		sdtLkNode.setAttribute("w:val", "stdLocked");
		sdtPrNode.appendChild(sdtLkNode);

		const plchldNode = xmlDoc.createElement("w:placeholder");
		const docPartNode = xmlDoc.createElement("w:docPart");
		docPartNode.setAttribute("w:val", "9F0D672809674A8FB6D401EF76C335D2"); // field.description);
		plchldNode.appendChild(docPartNode);
		sdtPrNode.appendChild(plchldNode);

		const splNode = xmlDoc.createElement("w:showingPlcHdrt");
		sdtPrNode.appendChild(splNode);

		const dateNode = xmlDoc.createElement("w:date");
		let dcNode = xmlDoc.createElement("w:dateFormat");
		dcNode.setAttribute("w:val", "dd/MM/yyyy");
		dateNode.appendChild(dcNode);

		dcNode = xmlDoc.createElement("w:lid");
		dcNode.setAttribute("w:val", "en-US");
		dateNode.appendChild(dcNode);

		dcNode = xmlDoc.createElement("w:storeMappedDataAs");
		dcNode.setAttribute("w:val", "dateTime");
		dateNode.appendChild(dcNode);

		dcNode = xmlDoc.createElement("w:calendar");
		dcNode.setAttribute("w:val", "gregorian");
		dateNode.appendChild(dcNode);
		sdtPrNode.appendChild(dateNode);

		sdtNode.appendChild(sdtPrNode);

		const sdtCntNode = xmlDoc.createElement("w:sdtContent");
		const sdtpNode = xmlDoc.createElement("w:p");
		sdtpNode.setAttribute("w14:paraId", "4C246CE6");
		sdtpNode.setAttribute("w:rsidR", "002678AD");
		sdtpNode.setAttribute("w:rsidRDefault", "002678AD");
		sdtpNode.setAttribute("w:rsidP", "002678AD");

		const sdtrNode = xmlDoc.createElement("w:r");
		sdtrNode.setAttribute("w:rsidRPr", "00BF558F");

		const sdtrpNode = xmlDoc.createElement("w:rPr");
		const rsNode = xmlDoc.createElement("w:rStyle");
		rsNode.setAttribute("w:val", "PlaceholderText");
		sdtrpNode.appendChild(rsNode);
		const sdtbrdNode = xmlDoc.createElement("w:bdr");
		sdtbrdNode.setAttribute("w:val", "single");
		sdtbrdNode.setAttribute("w:sz", "4");
		sdtbrdNode.setAttribute("w:space", "0");
		sdtbrdNode.setAttribute("w:color", "auto");
		sdtrpNode.appendChild(sdtbrdNode);

		sdtrNode.appendChild(sdtrpNode);

		const sdttNode = xmlDoc.createElement("w:t");
		sdttNode.textContent = "Click or tap to enter a date";
		sdtrNode.appendChild(sdttNode);
		sdtpNode.appendChild(sdtrNode);
		sdtCntNode.appendChild(sdtpNode);

		sdtNode.appendChild(sdtCntNode);

		return sdtNode;
	}

	addPartDotImageNode(xmlDoc, field) {
		const sdtNode = xmlDoc.createElement("w:sdt");

		const sdtPrNode = xmlDoc.createElement("w:sdtPr");
		const sdtiNode = xmlDoc.createElement("w:id");
		sdtiNode.setAttribute("w:val", "1905877840");
		sdtPrNode.appendChild(sdtiNode);

		const sdtaNode = xmlDoc.createElement("w:alias");
		sdtaNode.setAttribute("w:val", field.description);
		sdtPrNode.appendChild(sdtaNode);

		const sdttNode = xmlDoc.createElement("w:tag");
		sdttNode.setAttribute("w:val", this.setFieldTag(field));
		sdtPrNode.appendChild(sdttNode);

		const lkNode = xmlDoc.createElement("w:lock");
		lkNode.setAttribute("w:val", "sdtLocked");
		sdtPrNode.appendChild(lkNode);

		const splNode = xmlDoc.createElement("w:showingPlcHdr");
		sdtPrNode.appendChild(splNode);

		const picNode = xmlDoc.createElement("w:picture");
		sdtPrNode.appendChild(picNode);
		sdtNode.appendChild(sdtPrNode);

		const sdtCntNode = xmlDoc.createElement("w:sdtContent");
		const sdtpNode = xmlDoc.createElement("w:p");
		sdtpNode.setAttribute("w:rsidR", "006E29F3");
		sdtpNode.setAttribute("w:rsidRDefault", "00312414");

		const sdtrNode = xmlDoc.createElement("w:r");
		const sdtrPrNode = xmlDoc.createElement("w:rPr");
		const sdtnpNode = xmlDoc.createElement("w:noProof");
		sdtrPrNode.appendChild(sdtnpNode);
		sdtrNode.appendChild(sdtrPrNode);

		const sdtrdrNode = xmlDoc.createElement("w:drawing");
		const wpiNode = xmlDoc.createElement("wp:inline");
		wpiNode.setAttribute("distT", "0");
		wpiNode.setAttribute("distB", "0");
		wpiNode.setAttribute("distL", "0");
		wpiNode.setAttribute("distR", "0");

		let wpicNode = xmlDoc.createElement("wp:extent");
		wpicNode.setAttribute("cx", "1905000");
		wpicNode.setAttribute("cy", "1905000");
		wpiNode.appendChild(wpicNode);

		wpicNode = xmlDoc.createElement("wp:effectExtent");
		wpicNode.setAttribute("l", "0");
		wpicNode.setAttribute("t", "0");
		wpicNode.setAttribute("r", "0");
		wpicNode.setAttribute("b", "0");
		wpiNode.appendChild(wpicNode);

		wpicNode = xmlDoc.createElement("wp:docPr");
		wpicNode.setAttribute("id", "1");
		wpicNode.setAttribute("name", "Picture 1");
		wpiNode.appendChild(wpicNode);

		wpicNode = xmlDoc.createElement("wp:cNvGraphicFramePr");
		let wpicaNode = xmlDoc.createElement("a:graphicFrameLocks");
		wpicaNode.setAttribute("xmlns:a", "http://schemas.openxmlformats.org/drawingml/2006/main");
		wpicaNode.setAttribute("noChangeAspect", "1");
		wpicNode.appendChild(wpicaNode);
		wpiNode.appendChild(wpicNode);

		wpicNode = xmlDoc.createElement("a:graphic");
		wpicNode.setAttribute("xmlns:a", "http://schemas.openxmlformats.org/drawingml/2006/main");
		wpicaNode = xmlDoc.createElement("a:graphicData");
		wpicaNode.setAttribute("uri", "http://schemas.openxmlformats.org/drawingml/2006/picture");
		const picpicNode = xmlDoc.createElement("pic:pic");
		picpicNode.setAttribute("xmlns:pic", "http://schemas.openxmlformats.org/drawingml/2006/picture");

		const picnvPrNode = xmlDoc.createElement("pic:nvPicPr");
		const piccnvprNode = xmlDoc.createElement("pic:cNvPr");
		piccnvprNode.setAttribute("id", "0");
		piccnvprNode.setAttribute("name", "Picture 1");
		picnvPrNode.appendChild(piccnvprNode);

		const piccnvpicNode = xmlDoc.createElement("pic:cNvPicPr");
		const piccaNode = xmlDoc.createElement("a:picLocks");
		piccaNode.setAttribute("noChangeArrowheads", "1");
		piccaNode.setAttribute("noChangeAspect", "1");
		piccnvpicNode.appendChild(piccaNode);
		picnvPrNode.appendChild(piccnvpicNode);
		picpicNode.appendChild(picnvPrNode);

		const blpflNode = xmlDoc.createElement("pic:blipFill");
		const ablpNode = xmlDoc.createElement("a:blip");
		ablpNode.setAttribute("r:embed", "rId4");
		const aextLstNode = xmlDoc.createElement("a:extLst");
		const aextNode = xmlDoc.createElement("a:ext");
		aextNode.setAttribute("uri", "{28A0092B-C50C-407E-A947-70E740481C1C}");
		const aext14Node = xmlDoc.createElement("a14:useLocalDpi");
		aext14Node.setAttribute("xmlns:a14", "http://schemas.microsoft.com/office/drawing/2010/main");
		aext14Node.setAttribute("val", "0");
		aextNode.appendChild(aext14Node);
		aextLstNode.appendChild(aextNode);
		ablpNode.appendChild(aextLstNode);
		blpflNode.appendChild(ablpNode);

		const picrcNode = xmlDoc.createElement("a:srcRect");
		picnvPrNode.appendChild(picrcNode);
		const astrchNode = xmlDoc.createElement("a:stretch");
		const aflrcNode = xmlDoc.createElement("a:fillRect");
		astrchNode.appendChild(aflrcNode);
		blpflNode.appendChild(astrchNode);
		picpicNode.appendChild(blpflNode);

		const picspPrNode = xmlDoc.createElement("pic:spPr");
		picspPrNode.setAttribute("bwMode", "auto");
		const axfrmNode = xmlDoc.createElement("a:xfrm");
		const aoffNode = xmlDoc.createElement("a:off");
		aoffNode.setAttribute("x", "0");
		aoffNode.setAttribute("y", "0");
		axfrmNode.appendChild(aoffNode);
		const axextNode = xmlDoc.createElement("a:ext");
		axextNode.setAttribute("cx", "1905000");
		axextNode.setAttribute("cy", "1905000");
		axfrmNode.appendChild(axextNode);
		picspPrNode.appendChild(axfrmNode);

		const apGeomNode = xmlDoc.createElement("a:prstGeom");
		apGeomNode.setAttribute("prst", "rect");
		const avNode = xmlDoc.createElement("a:avLst");
		apGeomNode.appendChild(avNode);
		picspPrNode.appendChild(apGeomNode);

		const anfNode = xmlDoc.createElement("a:noFill");
		picspPrNode.appendChild(anfNode);

		const alnNode = xmlDoc.createElement("a:ln");
		const alnfNode = xmlDoc.createElement("a:noFill");
		alnNode.appendChild(alnfNode);
		picspPrNode.appendChild(alnNode);
		picpicNode.appendChild(picspPrNode);

		wpicaNode.appendChild(picpicNode);
		wpicNode.appendChild(wpicaNode);
		wpiNode.appendChild(wpicNode);
		sdtrdrNode.appendChild(wpiNode);
		sdtrNode.appendChild(sdtrdrNode);
		sdtpNode.appendChild(sdtrNode);
		sdtCntNode.appendChild(sdtpNode);

		sdtNode.appendChild(sdtCntNode);

		return sdtNode;
	}

	addPartDotLinkNode(xmlDoc, field) {

		const pNode = xmlDoc.createElement("w:p");
		pNode.setAttribute("w:rsidR", "009D17C8");
		pNode.setAttribute("w:rsidRDefault", "009D17C8");
		pNode.setAttribute("w:rsidRPr", "009D17C8");
		pNode.setAttribute("w:rsidP", "009D17C8");

		const anchor = this.bkmrk++;
		const plNode = xmlDoc.createElement("w:hyperlink");
		plNode.setAttribute("w:anchor", BKMRK_REF + anchor.toString());
		plNode.setAttribute("w:history", "1");

		const prNode = xmlDoc.createElement("w:r");
		prNode.setAttribute("w:rsidRPr", "009D17C8");

		const prpNode = xmlDoc.createElement("w:rPr");

		const prpsNode = xmlDoc.createElement("w:rStyle");
		prpsNode.setAttribute("w:val", "Hyperlink");
		prpNode.appendChild(prpsNode);
		prNode.appendChild(prpNode);

		const tNode = xmlDoc.createElement("w:t");
		tNode.textContent = field.referenceType;
		prNode.appendChild(tNode);
		plNode.appendChild(prNode);
		pNode.appendChild(plNode);

		const pbksNode = xmlDoc.createElement("w:bookmarkStart");
		pbksNode.setAttribute("w:id", "0");
		pbksNode.setAttribute("w:name", "_GoBack");
		pNode.appendChild(pbksNode);
		const pbkeNode = xmlDoc.createElement("w:bookmarkEnd");
		pbkeNode.setAttribute("w:id", "0");
		pNode.appendChild(pbkeNode);

		return (pNode);
	}

	addPartNoteNode(xmlDoc, field) {

		if (field.datatype.toLowerCase() === 'name') {
			return this.addPartNoteNodeValue(xmlDoc, "The item name should not contain the following characters:?&lt;%&gt;{}/\\|*");
		} else if (field.datatype.toLowerCase() === 'description') {
			return this.addPartNoteNodeValue(xmlDoc, "Content item description");
		} else if (field.datatype.toLowerCase() === 'text') {
			return this.addPartNoteNodeValue(xmlDoc, "Text with up to 2000 characters");
		} else if (field.datatype.toLowerCase() === 'largetext') {
			return this.addPartNoteNodeValue(xmlDoc, "Text with unlimited number of characters");
		} else if (field.datatype.toLowerCase() === 'boolean') {
			return this.addPartNoteNodeValue(xmlDoc, "True or false value");
		} else if (field.datatype.toLowerCase() === 'datetime') {
			return this.addPartNoteNodeValue(xmlDoc, "Date and time value in ISO 8601 format");
		} else if (field.datatype.toLowerCase() === 'decimal') {
			let txt = "Floating point or deimal value between ";
			txt += field.settings.options.min !== null ? field.settings.options.min : "-1000000000.00";
			txt += " and ";
			txt += field.settings.options.max !== null ? field.settings.options.max : "+100000000.00";
			return this.addPartNoteNodeValue(xmlDoc, txt);
		} else if (field.datatype.toLowerCase() === 'number') {
			let txt = "Signed integer value between ";
			txt += field.settings.options.min !== null ? field.settings.options.min : "-1000";
			txt += " and ";
			txt += field.settings.options.max !== null ? field.settings.options.max : "+1000";
			return this.addPartNoteNodeValue(xmlDoc, txt);
		} else if (field.datatype.toLowerCase() === CONSTANTS.CNT_DATA_TYPE_RIMG) {
			return this.addPartNoteNodeValue(xmlDoc, "Media file of type image");
		} else if (field.datatype.toLowerCase() === CONSTANTS.CNT_DATA_TYPE_RPTH) {
			let szn = "";
			field.settings.options.mediaTypes.forEach(item => {
				if (szn.length) szn += ' or ';
				szn += item;
			});
			return this.addPartNoteNodeValue(xmlDoc, "Media file of type: " + szn);
		} else if (field.datatype.toLowerCase() === CONSTANTS.CNT_DATA_TYPE_RITM) {
			let txt = "Reference to items of type \"";
			txt += field.referenceType;
			txt += "\"";
			return this.addPartNoteNodeValue(xmlDoc, txt);
		} else if (field.datatype.toLowerCase() === 'empty') {
			return this.addPartNoteNodeValue(xmlDoc, "");
		}

		return null;
	}

	addPartNoteNodeValue(xmlDoc, note) {
		const pNode = xmlDoc.createElement("w:p");
		pNode.setAttribute("w:rsidR", "00FF4430");
		pNode.setAttribute("w:rsidRDefault", "00FF4430");
		pNode.setAttribute("w:rsidRPr", "00FF4430");
		pNode.setAttribute("w:rsidP", "00FF4430");

		const rNode = xmlDoc.createElement("w:r");
		rNode.setAttribute("w:rsidRPr", "00FF4430");

		const rPrNode = xmlDoc.createElement("w:rPr");
		const clrNode = xmlDoc.createElement("w:color");
		clrNode.setAttribute("w:val", "A5A5A5");
		clrNode.setAttribute("w:themeColor", "accent3");
		rPrNode.appendChild(clrNode);
		const szNode = xmlDoc.createElement("w:sz");
		szNode.setAttribute("w:val", "20");
		rPrNode.appendChild(szNode);
		const szcNode = xmlDoc.createElement("w:szCs");
		szcNode.setAttribute("w:val", "20");
		rPrNode.appendChild(szcNode);
		rNode.appendChild(rPrNode);

		const tNode = xmlDoc.createElement("w:t");
		tNode.textContent = note;
		rNode.appendChild(tNode);
		pNode.appendChild(rNode);

		return pNode;
	}

	addFieldTitleNode(xmlDoc, field) {
		const pNode = xmlDoc.createElement("w:p");
		pNode.setAttribute("w:rsidR", "006E29F3");
		pNode.setAttribute("w:rsidRPr", "004B60C3");
		pNode.setAttribute("w:rsidRDefault", "00B06BF8");
		pNode.setAttribute("w:rsidP", "00B06BF8");

		const pPrNode = xmlDoc.createElement("w:pPr");
		const styledNode = xmlDoc.createElement("w:pStyle");
		styledNode.setAttribute("w:val", "NoSpacing");
		pPrNode.appendChild(styledNode);

		const rPrNode = xmlDoc.createElement("w:rPr");
		const bNode = xmlDoc.createElement("w:b");
		rPrNode.appendChild(bNode);

		const clrNode = xmlDoc.createElement("w:color");
		clrNode.setAttribute("w:val", "4472C4");
		clrNode.setAttribute("w:themeColor", "accent1");
		rPrNode.appendChild(clrNode);

		const szNode = xmlDoc.createElement("w:sz");
		szNode.setAttribute("w:val", "28");
		rPrNode.appendChild(szNode);

		const szCsNode = xmlDoc.createElement("w:szCs");
		szCsNode.setAttribute("w:val", "28");
		rPrNode.appendChild(szCsNode);

		pPrNode.appendChild(rPrNode);
		pNode.appendChild(pPrNode);

		const rNode = xmlDoc.createElement("w:r");
		rNode.setAttribute("w:rsidRPr", "004B60C3");

		const rPrNode1 = xmlDoc.createElement("w:rPr");
		const bNode1 = xmlDoc.createElement("w:b");
		rPrNode1.appendChild(bNode1);

		const clrNode1 = xmlDoc.createElement("w:color");
		clrNode1.setAttribute("w:val", "4472C4");
		clrNode1.setAttribute("w:themeColor", "accent1");
		rPrNode1.appendChild(clrNode1);

		const szNode1 = xmlDoc.createElement("w:sz");
		szNode1.setAttribute("w:val", "28");
		rPrNode1.appendChild(szNode1);

		const szCsNode1 = xmlDoc.createElement("w:szCs");
		szCsNode1.setAttribute("w:val", "28");
		rPrNode1.appendChild(szCsNode1);

		rNode.appendChild(rPrNode1);

		const tNode = xmlDoc.createElement("w:t");
		tNode.textContent = field.name;
		rNode.appendChild(tNode);

		pNode.appendChild(rNode);

		const bkStNode = xmlDoc.createElement("w:bookmarkStart");
		bkStNode.setAttribute("w:id", "0");
		bkStNode.setAttribute("w:name", "_GoBack");
		pNode.appendChild(bkStNode);

		const bkEnNode = xmlDoc.createElement("w:bookmarkEnd");
		bkEnNode.setAttribute("w:id", "0");
		pNode.appendChild(bkEnNode);

		return pNode;
	}

	addTitleNode(xmlDoc, name, hasNewPage = false, repoID = null, contentTypeName = null) {
		const pNode = xmlDoc.createElement("w:p");
		pNode.setAttribute("w:rsidR", "006E29F3");
		pNode.setAttribute("w:rsidRDefault", "00FF4430");
		pNode.setAttribute("w:rsidP", "00FF4430");

		const pPrNode = xmlDoc.createElement("w:pPr");
		const styledNode = xmlDoc.createElement("w:pStyle");
		styledNode.setAttribute("w:val", "Title");
		pPrNode.appendChild(styledNode);
		pNode.appendChild(pPrNode);

		const rNode = xmlDoc.createElement("w:r");
		// const rPrNode = xmlDoc.createElement("w:rPr");
		//     const vNode = xmlDoc.createElement("w:vanish");
		//     rPrNode.appendChild(vNode);
		// rNode.appendChild(rPrNode);

		if (hasNewPage) {
			const lrpNode = xmlDoc.createElement("w:br");
			lrpNode.setAttribute("w:type", "page");
			rNode.appendChild(lrpNode);
			// const lrpNode = xmlDoc.createElement("w:lastRenderedPageBreak");
			// rNode.appendChild(lrpNode);
		}
		const tNode = xmlDoc.createElement("w:t");
		tNode.textContent = name;
		rNode.appendChild(tNode);
		pNode.appendChild(rNode);

		// Smart tag (repo)
		if (repoID) {
			const fieldRepo = {
				datatype: VAL_REPO,
				description: "",
				name: repoID
			};
			const st = this.addSmartTag(xmlDoc, fieldRepo, SMRT_CNT_ITEM_REPO);
			if (st) pNode.appendChild(st);
		}

		// Smart tag (title)
		if (contentTypeName) {
			const fieldCT = {
				datatype: VAL_TITLE,
				description: "",
				name: contentTypeName
			};
			const st = this.addSmartTag(xmlDoc, fieldCT, SMRT_CNT_TYPE_NAME);
			if (st) pNode.appendChild(st);
		}
		return pNode;
	}

	addHeadingNode(xmlDoc, nb, name) {
		const pNode = xmlDoc.createElement("w:p");
		pNode.setAttribute("w:rsidR", "00FF4430");
		pNode.setAttribute("w:rsidRDefault", "00FF4430");
		pNode.setAttribute("w:rsidP", "00FF4430");

		const pPrNode = xmlDoc.createElement("w:pPr");
		const styledNode = xmlDoc.createElement("w:pStyle");
		styledNode.setAttribute("w:val", "Heading" + nb);
		pPrNode.appendChild(styledNode);
		pNode.appendChild(pPrNode);

		const rNode = xmlDoc.createElement("w:r");
		const tNode = xmlDoc.createElement("w:t");
		tNode.textContent = name;
		rNode.appendChild(tNode);
		pNode.appendChild(rNode);

		return pNode;
	}

	addNewLineNode(xmlDoc) {
		const pNode = xmlDoc.createElement("w:p");
		pNode.setAttribute("w:rsidR", "00992013");
		pNode.setAttribute("w:rsidRDefault", "00992013");
		pNode.setAttribute("w:rsidP", "00B06BF8");

		const pPrNode = xmlDoc.createElement("w:pPr");
		const styledNode = xmlDoc.createElement("w:pStyle");
		styledNode.setAttribute("w:val", "NoSpacing");
		pPrNode.appendChild(styledNode);
		pNode.appendChild(pPrNode);

		return pNode;
	}

	addNewPageNode(xmlDoc) {
		const pNode = xmlDoc.createElement("w:p");
		pNode.setAttribute("w:rsidR", "00992013");
		pNode.setAttribute("w:rsidRDefault", "00992013");
		pNode.setAttribute("w:rsidP", "00B06BF8");

		const prNode = xmlDoc.createElement("w:r");
		const styledNode = xmlDoc.createElement("w:br");
		styledNode.setAttribute("w:type", "page");
		prNode.appendChild(styledNode);
		pNode.appendChild(prNode);

		return pNode;
	}

	addFmtNode(xmlDoc) {
		const sprNode = xmlDoc.createElement("w:sectPr");
		sprNode.setAttribute("w:rsidR", "00794081");
		sprNode.setAttribute("w:rsidRPr", "00794081");

		const pzrNode = xmlDoc.createElement("w:pgSz");
		pzrNode.setAttribute("w:w", "12240");
		pzrNode.setAttribute("w:h", "15840");
		sprNode.appendChild(pzrNode);

		const pgmNode = xmlDoc.createElement("w:pgMar");
		pgmNode.setAttribute("w:top", "1440");
		pgmNode.setAttribute("w:right", "1440");
		pgmNode.setAttribute("w:bottom", "1440");
		pgmNode.setAttribute("w:left", "1440");
		pgmNode.setAttribute("w:header", "708");
		pgmNode.setAttribute("w:footer", "708");
		pgmNode.setAttribute("w:gutter", "0");
		sprNode.appendChild(pgmNode);

		const clNode = xmlDoc.createElement("w:cols");
		clNode.setAttribute("w:space", "708");
		sprNode.appendChild(clNode);

		const dgNode = xmlDoc.createElement("w:docGrid");
		dgNode.setAttribute("w:linePitch", "360");
		sprNode.appendChild(dgNode);

		return sprNode;
	}

	createWordArchive() {
		console.log(' - creating zip file...');
		// console.log(this.data.xmlRootFld);

		var tempPath = this.data.xmlRootFld;
		var name = this.data.fileName + (this.data.exportType ? '.dotx' : '.docx');
		var destPath = path.join(this.data.projectDir, 'dist');
		return new Promise(function (resolve, reject) {
			//
			// create the template zip file
			// 
			gulp.src([tempPath + '/**/*', tempPath + '/_rels/.rels'], {
					base: tempPath,
					allowEmpty: true
				})
				.pipe(zip(name))
				.pipe(gulp.dest(destPath))
				.on('end', function () {
					var zippath = path.join(destPath, name);
					console.log(' - created template file ' + zippath);
					return resolve({});
				});
		});
	}

	updateStyle(uuid, rootFld) {
		const docXml = Utils.appendToPathArray(rootFld, ["word", "glossary", "styles.xml"]);
		// $.get(docXml, {}, (xml) => {
		var xml = fs.readFileSync(docXml).toString();
		// console.log(xml);

		let content = xml;
		var xmlDoc = this.data.parser.parseFromString(content, "text/xml");

		var elements = xmlDoc.getElementsByTagName("w:styles");
		if (elements.length === 0) {
			// Style
			const titleNode = this.addStyle(xmlDoc, uuid);
			elements[0].appendChild(titleNode);

			var serializer = new XMLSerializer();
			content = serializer.serializeToString(xmlDoc);

			// Update document.xml
			Files.writeFileAsIs(docXml, content,
				this.updateStyleSuccessHandler.bind(this),
				this.updateStyleErrorHandler.bind(this));
		}
		//  });
	}

	updateStyleSuccessHandler(docXml) {
		console.log("updateStyleSuccessHandler");
	}

	updateStyleErrorHandler(err) {
		console.log("updateStyleErrorHandler");
		console.log(err);
	}

	getNewID() {
		const uuid = Utils.generateUUID().replace(/-/gi, '').toLowerCase();
		return uuid;
	}

	addStyle(xmlDoc, id) {
		const stlNode = xmlDoc.createElement("w:style");
		stlNode.setAttribute("w:type", "paragraph");
		stlNode.setAttribute("w:customStyle", "1");
		stlNode.setAttribute("w:styleId", id);

		const nameNode = xmlDoc.createElement("w:name");
		nameNode.setAttribute("w:val", id);
		stlNode.appendChild(nameNode);

		const ridNode = xmlDoc.createElement("w:rsid");
		ridNode.setAttribute("w:val", "00B330D5");
		stlNode.appendChild(ridNode);

		const rprNode = xmlDoc.createElement("w:rPr");
		const fntNode = xmlDoc.createElement("w:rFonts");
		fntNode.setAttribute("w:eastAsiaTheme", "minorHAnsi");
		rprNode.appendChild(fntNode);
		const lngNode = xmlDoc.createElement("w:lang");
		lngNode.setAttribute("w:eastAsia", "en-US");
		rprNode.appendChild(lngNode);
		stlNode.appendChild(rprNode);

		return stlNode;
	}

	updateExportTypeToContentType(rootFld) {

		return new Promise((resolve, reject) => {

			const docXml = Utils.appendToPath(rootFld, "[Content_Types].xml");
			// $.get(docXml, {}, (xml) => {
			var xml = fs.readFileSync(docXml).toString();

			let content = xml;
			var xmlDoc = this.data.parser.parseFromString(content, "text/xml");

			var elements = xmlDoc.getElementsByTagName("Override");
			for (let idx = 0; idx < elements.length; idx++) {
				let type = elements[idx].getAttribute("ContentType");
				if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml") {
					type = type.replace('template', 'document');
					elements[idx].setAttribute("ContentType", type);
					break;
				}
			}

			var serializer = new XMLSerializer();
			content = serializer.serializeToString(xmlDoc);

			// Update xml
			console.log(' - updating xml ' + docXml);
			const p = Files.writeFileAsIsP(docXml, content);
			p.then(() => {
					console.log("updateExportTypeToContentType ok: " + docXml);
					resolve(1);
				})
				.catch((err) => {
					console.log("updateExportTypeToContentType err: " + docXml);
					console.log(err);
				});
		});
		// });
	}

	addPartDocNode(xmlDoc, field) {

		return new Promise((resolve, reject) => {

			if (field.datatype.toLowerCase() === 'text') {
				resolve(this.addPartDocTextNode(xmlDoc, field));
			} else if (field.datatype.toLowerCase() === 'largetext') {
				resolve(this.addPartDocLargeTextNode(xmlDoc, field));
			} else if (field.datatype.toLowerCase() === 'boolean') {
				resolve(this.addPartDocTextNode(xmlDoc, field));
			} else if (field.datatype.toLowerCase() === 'datetime') {
				resolve(this.addPartDocTextNode(xmlDoc, field));
			} else if (field.datatype.toLowerCase() === 'number') {
				resolve(this.addPartDocTextNode(xmlDoc, field));
			} else if (field.datatype.toLowerCase() === 'decimal') {
				resolve(this.addPartDocTextNode(xmlDoc, field));
			} else if (field.datatype.toLowerCase() === 'reference' &&
				field.referenceType && field.referenceType.toLowerCase() === "digitalasset") {
				if (field.settings.options.mediaTypes.length === 1 &&
					field.settings.options.mediaTypes[0].toLowerCase() === 'images') {
					resolve(this.addPartDocImageNode(xmlDoc, field));
				} else {
					resolve(this.addPartDocLinkNode(xmlDoc, field));
					// return this.addPartDotTextNode(xmlDoc, field);
				}
			} else {
				resolve([]);
			}
		});
	}

	addPartDocTextNode(xmlDoc, field) {

		return new Promise((resolve, reject) => {

			const pNodes = [];
			const pNode = xmlDoc.createElement("w:p");
			pNode.setAttribute("w:rsidR", "00FF4430");
			pNode.setAttribute("w:rsidRPr", "00FF4430");
			pNode.setAttribute("w:rsidRDefault", "00FF4430");
			pNode.setAttribute("w:rsidP", "00FF4430");

			const prNode = xmlDoc.createElement("w:r");
			prNode.setAttribute("w:rsidRPr", "00FF4430");

			const prpNode = xmlDoc.createElement("w:rPr");
			const prpcNode = xmlDoc.createElement("w:color");
			prpcNode.setAttribute("w:val", "A5A5A5");
			prpcNode.setAttribute("w:themeColor", "accent3");
			prpNode.appendChild(prpcNode);
			prNode.appendChild(prpNode);

			const tNode = xmlDoc.createElement("w:t");
			let value = field.value;
			if (field.datatype.toLowerCase() === 'datetime') {
				const params = this.main.fmtDateTimeParams(field.value.value);
				value = params.dt.toLocaleDateString(params.loc);
			}
			tNode.textContent = value;
			prNode.appendChild(tNode);
			pNode.appendChild(prNode);
			pNodes.push(pNode);

			resolve(pNodes);
		});
	}

	addPartDocLargeTextNode(xmlDoc, field) {

		return new Promise((resolve, reject) => {

			const pNodes = [];

			const htmlData = this.data.parser.parseFromString(field.value, "text/html");

			var elements = htmlData.getElementsByTagName("body");
			if (elements.length) {

				this.addChildrenNodes(xmlDoc, elements[0].children)
					.then((result) => {
						if (result.length) {
							result.forEach(pNode => {
								pNodes.push(pNode);
							});
						}
						resolve(pNodes);
					});
			} else {
				resolve(pNodes);
			}
		});
	}

	addPartDocLinkNode(xmlDoc, field) {

		return new Promise((resolve, reject) => {

			const pNodes = [];
			let filePath = '';
			let rId = 'rId4';
			this.downloadReference(field.value)
				.then((result) => {
					filePath = result;
					return this.getLinkRelId(filePath, true);
				})
				.then((result) => {
					rId = result;

					const pNode = xmlDoc.createElement("w:p");
					pNode.setAttribute("w:rsidR", "00FF4430");
					pNode.setAttribute("w:rsidRDefault", "00FF4430");

					this.addChildLinkNode(xmlDoc, pNode, rId, filePath);
					pNodes.push(pNode);

					resolve(pNodes);
				});
		});
	}

	addPartDocImageNode(xmlDoc, field) {

		return new Promise((resolve, reject) => {

			const pNodes = [];
			let pictNo = 1;
			let relId = "rId1";
			const size = {
				width: "1905000",
				height: "1905000"
			};
			let pNode = null;
			this.makeImageNode(xmlDoc, pictNo, relId, size, field.value.name)
				.then(result => {
					pNode = result;
					return this.getImageNumber(field.value.name);
				})
				.then((result) => {
					pictNo = result; // Update pict
					this.updateNodeImagePictureNumber(pNode, pictNo);
					return this.downloadImage(pictNo, field.value);
				})
				.then((result) => {
					return this.getImageSize(pictNo, field.value.name);
				})
				.then((result) => {
					size.width = Utils.pixelsToEMU(result.width).toString();
					size.height = Utils.pixelsToEMU(result.height).toString();
					this.updateNodeImageSize(pNode, size);
					return this.getImageRelId(field.value.name);
				})
				.then((result) => {
					relId = result;
					this.updateNodeImageId(pNode, relId);
					pNodes.push(pNode);
					resolve(pNodes);
				})
				.catch(() => {
					resolve(pNodes);
				});
		});
	}

	updateNodeImagePictureNumber(pNode, pictNo) {
		const dpr = pNode.getElementsByTagName("wp:docPr");
		if (dpr.length) {
			dpr[0].setAttribute("id", pictNo.toString());
			dpr[0].setAttribute("name", "Picture " + pictNo.toString());
		}
		const nvpr = pNode.getElementsByTagName("pic:cNvPr");
		if (nvpr.length) {
			nvpr[0].setAttribute("id", pictNo.toString());
		}
	}

	updateNodeImageSize(pNode, size) {
		const dpr = pNode.getElementsByTagName("wp:extent");
		if (dpr.length) {
			dpr[0].setAttribute("cx", size.width);
			dpr[0].setAttribute("cy", size.height);
		}
		const xpr = pNode.getElementsByTagName("a:xfrm");
		if (xpr.length) {
			const apr = xpr[0].getElementsByTagName("a:ext");
			if (apr.length) {
				apr[0].setAttribute("cx", size.width);
				apr[0].setAttribute("cy", size.height);
			}
		}
	}

	updateNodeImageId(pNode, relId) {
		const apr = pNode.getElementsByTagName("a:blip");
		if (apr.length) {
			apr[0].setAttribute("r:embed", relId);
		}
	}

	makeImageNode(xmlDoc, pictNo, relId, size, name, pParent = null) {

		return new Promise((resolve, reject) => {

			let pNode = null;
			if (pParent === null) {
				pNode = xmlDoc.createElement("w:p");
				pNode.setAttribute("w:rsidR", "006E29F3");
				pNode.setAttribute("w:rsidRDefault", "00312414");
			} else {
				pNode = pParent;
			}

			const rNode = xmlDoc.createElement("w:r");
			const rprNode = xmlDoc.createElement("w:rPr");
			const npNode = xmlDoc.createElement("w:noProof");
			rprNode.appendChild(npNode);
			rNode.appendChild(rprNode);

			const drwNode = xmlDoc.createElement("w:drawing");
			const wpiNode = xmlDoc.createElement("wp:inline");
			wpiNode.setAttribute("distT", "0");
			wpiNode.setAttribute("distB", "0");
			wpiNode.setAttribute("distL", "0");
			wpiNode.setAttribute("distR", "0");

			let wpicNode = xmlDoc.createElement("wp:extent");
			wpicNode.setAttribute("cx", size.width);
			wpicNode.setAttribute("cy", size.height);
			wpiNode.appendChild(wpicNode);

			wpicNode = xmlDoc.createElement("wp:effectExtent");
			wpicNode.setAttribute("l", "0");
			wpicNode.setAttribute("t", "0");
			wpicNode.setAttribute("r", "0");
			wpicNode.setAttribute("b", "0");
			wpiNode.appendChild(wpicNode);

			wpicNode = xmlDoc.createElement("wp:docPr");
			wpicNode.setAttribute("id", pictNo.toString());
			wpicNode.setAttribute("name", "Picture " + pictNo.toString());
			wpiNode.appendChild(wpicNode);

			wpicNode = xmlDoc.createElement("wp:cNvGraphicFramePr");
			let wpicaNode = xmlDoc.createElement("a:graphicFrameLocks");
			wpicaNode.setAttribute("xmlns:a", "http://schemas.openxmlformats.org/drawingml/2006/main");
			wpicaNode.setAttribute("noChangeAspect", "1");
			wpicNode.appendChild(wpicaNode);
			wpiNode.appendChild(wpicNode);

			wpicNode = xmlDoc.createElement("a:graphic");
			wpicNode.setAttribute("xmlns:a", "http://schemas.openxmlformats.org/drawingml/2006/main");
			wpicaNode = xmlDoc.createElement("a:graphicData");
			wpicaNode.setAttribute("uri", "http://schemas.openxmlformats.org/drawingml/2006/picture");
			const picpicNode = xmlDoc.createElement("pic:pic");
			picpicNode.setAttribute("xmlns:pic", "http://schemas.openxmlformats.org/drawingml/2006/picture");

			const picnvPrNode = xmlDoc.createElement("pic:nvPicPr");
			const piccnvprNode = xmlDoc.createElement("pic:cNvPr");
			piccnvprNode.setAttribute("id", pictNo.toString());
			piccnvprNode.setAttribute("name", name);
			picnvPrNode.appendChild(piccnvprNode);

			const piccnvpicNode = xmlDoc.createElement("pic:cNvPicPr");
			picnvPrNode.appendChild(piccnvpicNode);
			picpicNode.appendChild(picnvPrNode);

			const blpflNode = xmlDoc.createElement("pic:blipFill");
			const ablpNode = xmlDoc.createElement("a:blip");
			ablpNode.setAttribute("r:embed", relId);
			const aextLstNode = xmlDoc.createElement("a:extLst");
			const aextNode = xmlDoc.createElement("a:ext");
			aextNode.setAttribute("uri", "{28A0092B-C50C-407E-A947-70E740481C1C}");
			const aext14Node = xmlDoc.createElement("a14:useLocalDpi");
			aext14Node.setAttribute("xmlns:a14", "http://schemas.microsoft.com/office/drawing/2010/main");
			aext14Node.setAttribute("val", "0");
			aextNode.appendChild(aext14Node);
			aextLstNode.appendChild(aextNode);
			ablpNode.appendChild(aextLstNode);
			blpflNode.appendChild(ablpNode);

			const astrchNode = xmlDoc.createElement("a:stretch");
			const aflrcNode = xmlDoc.createElement("a:fillRect");
			astrchNode.appendChild(aflrcNode);
			blpflNode.appendChild(astrchNode);
			picpicNode.appendChild(blpflNode);

			const picspPrNode = xmlDoc.createElement("pic:spPr");
			const axfrmNode = xmlDoc.createElement("a:xfrm");
			const aoffNode = xmlDoc.createElement("a:off");
			aoffNode.setAttribute("x", "0");
			aoffNode.setAttribute("y", "0");
			axfrmNode.appendChild(aoffNode);
			const axextNode = xmlDoc.createElement("a:ext");
			axextNode.setAttribute("cx", size.width);
			axextNode.setAttribute("cy", size.height);
			axfrmNode.appendChild(axextNode);
			picspPrNode.appendChild(axfrmNode);

			const apGeomNode = xmlDoc.createElement("a:prstGeom");
			apGeomNode.setAttribute("prst", "rect");
			const avNode = xmlDoc.createElement("a:avLst");
			apGeomNode.appendChild(avNode);
			picspPrNode.appendChild(apGeomNode);
			picpicNode.appendChild(picspPrNode);

			wpicaNode.appendChild(picpicNode);
			wpicNode.appendChild(wpicaNode);
			wpiNode.appendChild(wpicNode);
			drwNode.appendChild(wpiNode);
			rNode.appendChild(drwNode);
			pNode.appendChild(rNode);

			if (name.length && pParent === null) {
				const r1Node = xmlDoc.createElement("w:r");

				const prpNode = xmlDoc.createElement("w:rPr");
				const prpcNode = xmlDoc.createElement("w:color");
				prpcNode.setAttribute("w:val", "A5A5A5");
				prpcNode.setAttribute("w:themeColor", "accent3");
				prpNode.appendChild(prpcNode);
				r1Node.appendChild(prpNode);

				const r1tNode = xmlDoc.createElement("w:t");
				r1tNode.setAttribute("xml:space", "preserve");
				r1tNode.textContent = "   " + name;
				r1Node.appendChild(r1tNode);
				pNode.appendChild(r1Node);
			}

			// if (pParent) pParent.appendChild(pNode);
			resolve(pNode);
		});
	}

	getImageNumber(name) {

		return new Promise((resolve, reject) => {

			this.getImageLastNumber(name)
				.then(result => {
					const lastNb = result;

					let id = '';
					const ext = Utils.getFileExtension(name);
					if (ext.length) {
						id = this.data.images.indexOf(ext);
						if (id === -1) {
							this.data.images.push(ext);
							if (lastNb === -1) id = this.data.images.length;
							else id = lastNb + 1;
							// Update [Content_Types]
							this.addImageTypeToContentType(this.data.xmlRootFld, ext)
								.then(() => {
									resolve(id);
								})
								.catch(() => {
									console.log("getImageNumber err");
								});
						} else {
							if (lastNb === -1) id = this.data.images.length;
							else id = lastNb + 1;
							resolve(id);
						}
					} else {
						resolve(id);
					}
				});
		});
	}

	getImageRelId(name) {

		return new Promise((resolve, reject) => {

			let id = '';
			const ext = Utils.getFileExtension(name);
			if (ext.length) {

				const docXml = Utils.appendToPathArray(this.data.xmlRootFld, ["word", "_rels", "document.xml.rels"]);
				$.get(docXml, {}, (xml) => {

					let content = xml;
					var xmlDoc = this.data.parser.parseFromString(content, "text/xml");

					const prfId = "rId";
					const mimg = "media/image";
					const images = [];
					let nextrId = 1;

					let imgFound = false;
					var elements = xmlDoc.getElementsByTagName("Relationship");
					for (let idx = 0; idx < elements.length; idx++) {
						// Get the highest number
						const srId = elements[idx].getAttribute("Id");
						const rId = srId.substr(prfId.length, srId.length);
						nextrId = Math.max(nextrId, Number.parseInt(rId));

						const tgt = elements[idx].getAttribute("Target");

						// Check if we find the extension
						const pext = tgt.indexOf("." + ext);
						if (pext !== -1) {
							imgFound = true;
							id = srId;
							const pos = tgt.indexOf(mimg);
							if (pos !== -1) images.push(tgt.substr(pos + mimg.length, pext));
						}
					}

					this.getImageNumber(name)
						.then((result) => {
							const nn = result;
							const pos = images.indexOf(nn.toString());
							if (pos === -1) imgFound = false;

							if (imgFound === false) {
								// We need to add 
								elements = xmlDoc.getElementsByTagName("Relationships");
								if (elements.length) {
									const relNode = xmlDoc.createElement("Relationship");
									nextrId++;

									id = prfId + nextrId.toString();
									relNode.setAttribute("Id", id);
									relNode.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image");
									relNode.setAttribute("Target", mimg + nn + "." + ext);
									// Workaround for empty xlmns
									relNode.setAttribute("xmlns", "http://schemas.openxmlformats.org/package/2006/relationships");
									elements[0].appendChild(relNode);

									var serializer = new XMLSerializer();
									content = serializer.serializeToString(xmlDoc);

									// Update xml
									return Files.writeFileAsIsP(docXml, content);
								}
							} else {
								resolve(id);
							}
						})
						.then(() => {
							console.log("getImageRelId ok: " + docXml);
							resolve(id);
						})
						.catch((err) => {
							console.log("getImageRelId err: " + docXml);
							resolve(id);
							console.log(err);
						});
				});
			}
		});
	}

	getImageLastNumber(name) {

		return new Promise((resolve, reject) => {

			let lastNb = -1;
			const docXml = Utils.appendToPathArray(this.data.xmlRootFld, ["word", "_rels", "document.xml.rels"]);
			$.get(docXml, {}, (xml) => {

				const content = xml;
				var xmlDoc = this.data.parser.parseFromString(content, "text/xml");

				const mimg = "media/image";

				var elements = xmlDoc.getElementsByTagName("Relationship");
				for (let idx = 0; idx < elements.length; idx++) {
					// Get the highest number
					const tgt = elements[idx].getAttribute("Target");
					const pos = tgt.lastIndexOf(mimg);
					const pext = tgt.lastIndexOf(".");
					if (pos !== -1 && pext !== -1) {
						const nb = tgt.substr(pos + mimg.length, pext);
						lastNb = Math.max(lastNb, Number.parseInt(nb));
					}
				}
				resolve(lastNb);
			});
		});
	}

	getLinkRelId(filePath, isFile) {
		return new Promise((resolve, reject) => {

			let id = '';
			const docXml = Utils.appendToPathArray(this.data.xmlRootFld, ["word", "_rels", "document.xml.rels"]);
			$.get(docXml, {}, (xml) => {

				let content = xml;
				var xmlDoc = this.data.parser.parseFromString(content, "text/xml");

				const prfId = "rId";
				let nextrId = 1;

				let lnkFound = false;
				var elements = xmlDoc.getElementsByTagName("Relationship");
				for (let idx = 0; idx < elements.length; idx++) {
					// Get the highest number
					const srId = elements[idx].getAttribute("Id");
					const rId = srId.substr(prfId.length, srId.length);
					nextrId = Math.max(nextrId, Number.parseInt(rId));

					const tgt = elements[idx].getAttribute("Target");

					// Check if we find the extension
					const pext = tgt.indexOf(filePath);
					if (pext !== -1) {
						lnkFound = true;
						id = srId;
					}
				}

				if (lnkFound === false) {
					// We need to add 
					elements = xmlDoc.getElementsByTagName("Relationships");
					if (elements.length) {
						const relNode = xmlDoc.createElement("Relationship");
						nextrId++;

						id = prfId + nextrId.toString();
						relNode.setAttribute("Id", id);
						relNode.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink");
						const path = (isFile ? "file:///" : "") + filePath;
						relNode.setAttribute("Target", path);
						relNode.setAttribute("TargetMode", "External");

						// Workaround for empty xlmns
						relNode.setAttribute("xmlns", "http://schemas.openxmlformats.org/package/2006/relationships");
						elements[0].appendChild(relNode);

						var serializer = new XMLSerializer();
						content = serializer.serializeToString(xmlDoc);

						// Update xml
						const p = Files.writeFileAsIsP(docXml, content);
						p.then(() => {
								console.log("getImageRelId ok: " + docXml);
								resolve(id);
							})
							.catch((err) => {
								console.log("getImageRelId err: " + docXml);
								console.log(err);
							});
					}
				} else {
					resolve(id);
				}
			});
		});
	}

	addImageTypeToContentType(rootFld, img) {

		return new Promise((resolve, reject) => {

			const docXml = Utils.appendToPath(rootFld, "[Content_Types].xml");
			$.get(docXml, {}, (xml) => {

				let content = xml;
				var xmlDoc = this.data.parser.parseFromString(content, "text/xml");

				let imgFound = false;
				var elements = xmlDoc.getElementsByTagName("Default");
				for (let idx = 0; idx < elements.length; idx++) {
					if (elements[idx].getAttribute("Extension") === img) {
						imgFound = true;
						break;
					}
				}

				if (imgFound === false) {
					elements = xmlDoc.getElementsByTagName("Types");
					if (elements.length) {
						const defNode = xmlDoc.createElement("Default");
						defNode.setAttribute("Extension", img);
						defNode.setAttribute("ContentType", Utils.getMimeTypeFromDocFormatType("", img));
						// Workaround because of an empty xlmns
						defNode.setAttribute("xmlns", "http://schemas.openxmlformats.org/package/2006/content-types");
						elements[0].appendChild(defNode);

						var serializer = new XMLSerializer();
						content = serializer.serializeToString(xmlDoc);

						// Update xml
						const p = Files.writeFileAsIsP(docXml, content);
						p.then(() => {
								console.log("addImageTypeToContentType ok: " + docXml);
								resolve(3);
							})
							.catch((err) => {
								console.log("addImageTypeToContentType err: " + docXml);
								console.log(err);
								resolve(3);
							});
					} else {
						resolve(3);
					}
				} else {
					resolve(3);
				}
			});
		});
	}

	downloadImage(pictNo, img) {

		return new Promise((resolve, reject) => {

			const assetFile = new AssetFile(img.id, "0.1", "", this.data.repoID);
			assetFile.caasID = img.id;
			assetFile.assetName = img.name;
			assetFile.name = img.name;
			if (assetFile.name.length === 0 && img.url && img.url.length) {
				const pos = img.url.lastIndexOf("/");
				if (pos !== -1) {
					assetFile.name = img.url.substr(pos + 1, img.url.length);
					assetFile.assetName = assetFile.name;
				}
			}

			const filePath = Utils.appendToPathArray(this.data.xmlRootFld, ["word", "media", "image" + pictNo.toString() + "." + Utils.getFileExtension(assetFile.name)]);
			const params = {
				useCaasApi: true,
				assetFile: assetFile,
				filePath: filePath,
				procType: "",
				link: "",
				extUrl: img.url
			};
			const p = this.main.view.requests.downloadAssetP(params);
			p.then((blob) => {
					return this.writeFileP(params, blob);
				})
				.then(() => {
					resolve(3);
				})
				.catch((err) => {
					console.log(err);
					resolve(3);
				});
		});
	}

	downloadReference(asset) {

		return new Promise((resolve, reject) => {

			const assetFile = new AssetFile(asset.id, "0.1", "", this.data.repoID);
			assetFile.caasID = asset.id;
			assetFile.assetName = asset.name;
			assetFile.name = asset.name;

			const filePath = Utils.appendToPath(this.data.destFld, asset.name);
			const params = {
				useCaasApi: true,
				assetFile: assetFile,
				filePath: filePath,
				procType: "",
				link: ""
			};
			const p = this.main.view.requests.downloadAssetP(params);
			p.then((blob) => {
					return this.writeFileP(params, blob);
				})
				.then(() => {
					resolve(filePath);
				})
				.catch((err) => {
					console.log(err);
					resolve("");
				});
		});
	}

	downloadContentItemInfo(id) {

		return new Promise((resolve, reject) => {

			const params = {
				useCaasApi: true,
				caasID: id,
				itemID: id,
				repoID: this.data.repoID
			};
			this.main.view.requests.arGetAssetInfoP(params)
				.then((result) => {
					resolve(result);
				})
				.catch((err) => {
					console.log(err);
					resolve(null);
				});
		});
	}

	writeFileP(params, blob) {

		return new Promise((resolve, reject) => {
			var _this = this;
			const reader = new FileReader();
			reader.onload = function () {
				var dataUrl = reader.result;
				params.base64 = dataUrl.split(',')[1];
				const filePath = decodeURI(params.filePath);
				params.filePath = filePath;

				const p = _Files.writeFileFromStreamP(params);
				p.then(() => {
						resolve();
					})
					.catch((err) => {
						console.log(err);
						resolve();
					});
			};
			reader.readAsDataURL(blob);
		});
	}

	getImageSize(pictNo, img) {

		const filePath = Utils.appendToPathArray(this.data.xmlRootFld, ["word", "media", "image" + pictNo.toString() + "." + Utils.getFileExtension(img)]);
		return new Promise((resolve, reject) => {

			var img = new Image();

			img.onload = function () {
				const size = {
					height: img.height,
					width: img.width
				};
				resolve(size);
			};
			img.src = filePath;
		});
	}

	addChildrenNodes(xmlDoc, children) {
		return new Promise((resolve, reject) => {

			const pNodes = [];
			// Enum all children
			const kids = [];
			for (let idx = 0; idx < children.length; idx++) {
				const p = this.addChildNode(xmlDoc, children[idx]);
				kids.push(p);
			}

			const result = kids.reduce((accumulatePromise, kid) => {
				return accumulatePromise.then((result) => {
					if (result) {
						pNodes.push.apply(pNodes, result);
					}
					return kid;
				});
			}, Promise.resolve());

			result.then(result => {
				if (result) {
					pNodes.push.apply(pNodes, result);
					resolve(pNodes);
				}
			});
		});
	}

	addChildNode(xmlDoc, kid) {

		return new Promise((resolve, reject) => {

			const pNodes = [];
			switch (kid.nodeName.toLowerCase()) {
				case 'p':
					this.addParagraphFromNode(xmlDoc, kid)
						.then((result) => {
							pNodes.push.apply(pNodes, result);
							resolve(pNodes);
						});
					break;
					// case 'ol':
					//     this.addOrderedListFromNode(xmlDoc, kid)
					//     .then((result) => {
					//         pNodes.push.apply(pNodes, result);
					//         resolve(pNodes);
					//     });
					//     break;
					// case 'ul':
					//     this.addUnorderedListFromNode(xmlDoc, kid)
					//     .then((result) => {
					//         pNodes.push.apply(pNodes, result);
					//         resolve(pNodes);
					//     });
					//     break;
					// case 'img':
					//     this.addImageFromNode(xmlDoc, kid)
					//     .then((result) => {
					//         pNodes.push.apply(pNodes, result);
					//         resolve(pNodes);
					//     });
					//     break;
				default:
					resolve(pNodes);
					break;
			}
		});
	}

	addParagraphFromNode(xmlDoc, dNode) {
		return new Promise((resolve, reject) => {

			const pNodes = [];
			const pNode = xmlDoc.createElement("w:p");
			pNode.setAttribute("w:rsidR", "00FF4430");
			pNode.setAttribute("w:rsidRPr", "00FF4430");
			pNode.setAttribute("w:rsidRDefault", "00FF4430");
			pNode.setAttribute("w:rsidP", "00FF4430");

			const childNodes = dNode.childNodes;
			const lstChild = [];
			for (let idx = 0; idx < childNodes.length; idx++) {
				const styles = [];
				const p = this.addChildPartNode(xmlDoc, pNode, styles, childNodes[idx]);
				lstChild.push(p);
			}

			const result = lstChild.reduce((accumulatePromise, child) => {
				return accumulatePromise.then((result) => {
					// console.log(child.nodeName.toLowerCase());
					return child;
				});
			}, Promise.resolve());

			result.then(result => {
				pNodes.push(pNode);
				resolve(pNodes);
			});
		});
	}

	addOrderedListFromNode(xmlDoc, dNode) {
		return new Promise((resolve, reject) => {
			const pNodes = [];
			resolve(pNodes);
		});
	}

	addUnorderedListFromNode(xmlDoc, dNode) {
		return new Promise((resolve, reject) => {
			const pNodes = [];
			resolve(pNodes);
		});
	}

	addImageFromNode(xmlDoc, dNode) {
		return new Promise((resolve, reject) => {
			const pNodes = [];
			resolve(pNodes);
		});
	}

	addChildPartNode(xmlDoc, pNode, styles, dNode) {

		return new Promise((resolve, reject) => {

			if (dNode.nodeName.toLowerCase() === '#text') {
				this.addChildTextNode(xmlDoc, pNode, styles, dNode.nodeValue)
					.then(result => {
						resolve();
					});
			} else if (dNode.nodeName.toLowerCase() === 'a') {
				let rId = 'rId';
				let lkNode = null;
				this.addChildLinkNode(xmlDoc, pNode, rId, dNode.innerText)
					.then(result => {
						lkNode = result;
						return this.getLinkRelId(dNode.href, false);
					})
					.then(result => {
						rId = result;
						lkNode.setAttribute('r:id', rId); // Update id
						resolve();
					});
			} else if (dNode.nodeName.toLowerCase() === 'img') {
				const url = dNode.getAttribute('src');
				let field = {
					value: {
						name: '',
						id: '',
						url: url
					}
				};
				this.extractImagePath(field)
					.then(result => {
						field = Object.assign({}, result);
						return this.addChildImageNode(xmlDoc, pNode, field);
					})
					.then(result => {
						resolve();
					});
			} else {
				this.addChildrenPartNode(xmlDoc, pNode, styles, dNode)
					.then(result => {
						resolve();
					});
			}
		});
	}

	extractImagePath(field) {

		return new Promise((resolve, reject) => {

			let pos = field.value.url.indexOf(IMG_PATH_ASSET_START);
			if (pos !== -1) {
				const pos1 = field.value.url.indexOf(IMG_PATH_ASSET_END);
				if (pos1 !== -1) {
					const id = field.value.url.substr(pos + IMG_PATH_ASSET_START.length, pos1 - IMG_PATH_ASSET_START.length);
					this.downloadContentItemInfo(id)
						.then(result => {
							field.value.id = id;
							field.value.name = result.name;
							field.value.url = null;
							resolve(field);
						});
				} else {
					resolve(field);
				}
			} else {
				pos = field.value.url.lastIndexOf('/');
				if (pos !== -1 && ((pos + 2) < field.value.url.length)) {
					field.name = field.value.url.substr(pos + 1, field.value.url.length);
					field.value.name = field.name;
				}
				resolve(field);
			}
		});
	}

	addChildTextNode(xmlDoc, pNode, styles, text) {

		return new Promise((resolve, reject) => {
			const prNode = xmlDoc.createElement("w:r");
			prNode.setAttribute("w:rsidRPr", "00FF4430");
			prNode.setAttribute("w:space", "preserve");

			const prpNode = xmlDoc.createElement("w:rPr");
			const prpcNode = xmlDoc.createElement("w:color");
			prpcNode.setAttribute("w:val", "A5A5A5");
			prpcNode.setAttribute("w:themeColor", "accent3");
			prpNode.appendChild(prpcNode);

			styles.forEach(style => {
				if (style === 'em') {
					const prpiNode = xmlDoc.createElement("w:i");
					prpNode.appendChild(prpiNode);
					const prpicNode = xmlDoc.createElement("w:iCs");
					prpNode.appendChild(prpicNode);
				} else if (style === 'strong') {
					const prpbNode = xmlDoc.createElement("w:b");
					prpNode.appendChild(prpbNode);
					const prpbcNode = xmlDoc.createElement("w:bCs");
					prpNode.appendChild(prpbcNode);
				} else if (style === 's') {
					const prpsNode = xmlDoc.createElement("w:strike");
					prpNode.appendChild(prpsNode);
				} else if (style === 'u') {
					const prpuNode = xmlDoc.createElement("w:u");
					prpuNode.setAttribute("w:val", "single");
					prpNode.appendChild(prpuNode);
				}
			});

			prNode.appendChild(prpNode);

			const tNode = xmlDoc.createElement("w:t");
			tNode.setAttribute("xml:space", "preserve");
			tNode.textContent = text;
			prNode.appendChild(tNode);
			pNode.appendChild(prNode);
			resolve();
		});
	}

	addChildrenPartNode(xmlDoc, pNode, styles, dNode) {

		return new Promise((resolve, reject) => {
			// Add style
			styles.push(dNode.nodeName.toLowerCase());

			const childNodes = dNode.childNodes;
			const lstChild = [];
			for (let idx = 0; idx < childNodes.length; idx++) {
				const _styles = styles.slice();
				const p = this.addChildPartNode(xmlDoc, pNode, _styles, childNodes[idx]);
				lstChild.push(p);
			}

			const result = lstChild.reduce((accumulatePromise, child) => {
				return accumulatePromise.then((result) => {
					// console.log(child.nodeName.toLowerCase());
					return child;
				});
			}, Promise.resolve());

			result.then(result => {
				// Remove style
				const pos = styles.indexOf(dNode.nodeName.toLowerCase());
				if (pos !== -1) styles.splice(pos, 1);
				resolve();
			});
		});
	}

	addChildLinkNode(xmlDoc, pNode, rId, text) {

		return new Promise((resolve, reject) => {

			const plNode = xmlDoc.createElement("w:hyperlink");
			plNode.setAttribute("r:id", rId);
			plNode.setAttribute("w:history", "1");

			const prNode = xmlDoc.createElement("w:r");
			prNode.setAttribute("w:rsidRPr", "00FF4430");

			const prpNode = xmlDoc.createElement("w:rPr");
			const prpcNode = xmlDoc.createElement("w:color");
			prpcNode.setAttribute("w:val", "126D91");
			// prpcNode.setAttribute("w:val", "A5A5A5");
			// prpcNode.setAttribute("w:themeColor", "accent3");
			prpNode.appendChild(prpcNode);

			const prpsNode = xmlDoc.createElement("w:rStyle");
			prpsNode.setAttribute("w:val", "Hyperlink");
			prpNode.appendChild(prpsNode);
			prNode.appendChild(prpNode);

			const tNode = xmlDoc.createElement("w:t");
			tNode.textContent = text;
			prNode.appendChild(tNode);
			plNode.appendChild(prNode);
			pNode.appendChild(plNode);
			resolve(plNode);
		});
	}

	addChildImageNode(xmlDoc, pNode, field) {

		return new Promise((resolve, reject) => {

			let pictNo = 1;
			let relId = "rId1";
			const size = {
				width: "1905000",
				height: "1905000"
			};
			let pImgNode = null;
			this.makeImageNode(xmlDoc, pictNo, relId, size, field.value.name, pNode)
				.then(result => {
					pImgNode = result;
					return this.getImageNumber(field.value.name);
				})
				.then((result) => {
					pictNo = result; // Update pict
					this.updateNodeImagePictureNumber(pImgNode, pictNo);
					return this.downloadImage(pictNo, field.value);
				})
				.then((result) => {
					return this.getImageSize(pictNo, field.value.name);
				})
				.then((result) => {
					size.width = Utils.pixelsToEMU(result.width).toString();
					size.height = Utils.pixelsToEMU(result.height).toString();
					this.updateNodeImageSize(pImgNode, size);
					return this.getImageRelId(field.value.name);
				})
				.then((result) => {
					relId = result;
					this.updateNodeImageId(pImgNode, relId);
					resolve(pImgNode);
				})
				.catch(() => {
					resolve(pImgNode);
				});
		});
	}


	addSmartTag(xmlDoc, field, type) {

		const pstNode = xmlDoc.createElement("w:smartTag");
		pstNode.setAttribute("w:uri", "http://purl.oclc.org/ooxml/smartTags");
		pstNode.setAttribute("w:element", type);

		const pstprNode = xmlDoc.createElement("w:smartTagPr");
		const pstpratNode = xmlDoc.createElement("w:attr");
		pstpratNode.setAttribute("w:name", field.name);
		let datatype = field.datatype;
		if (field.datatype === 'reference') {
			if (field.referenceType.toLowerCase() === 'digitalasset') {
				if (field.settings.options.mediaTypes.length === 1 &&
					field.settings.options.mediaTypes[0] === 'images') datatype += '_image';
				else datatype += '_path';
			} else {
				datatype += '_item';
			}
		}
		pstpratNode.setAttribute("w:val", datatype);
		pstprNode.appendChild(pstpratNode);
		pstNode.appendChild(pstprNode);

		return (pstNode);
	}

	addBookmark(xmlDoc, name = null) {
		const bkNodes = [];

		let bkmrk = this.bkmrk;
		if (name) {
			const pos = name.indexOf(BKMRK_REF);
			if (pos !== -1) bkmrk = parseInt(name.substr(pos + BKMRK_REF.length, name.length));
		} else {
			++this.bkmrk;
		}
		// const bkmrk = this.bkmrk++;
		let bkNode = xmlDoc.createElement("w:bookmarkStart");
		bkNode.setAttribute("w:id", bkmrk.toString());
		bkNode.setAttribute("w:name", BKMRK_REF + bkmrk.toString());
		bkNodes.push(bkNode);

		bkNode = xmlDoc.createElement("w:bookmarkEnd");
		bkNode.setAttribute("w:id", bkmrk.toString());
		bkNodes.push(bkNode);

		return (bkNodes);
	}

	getContentItemInfo() {

		return new Promise((resolve, reject) => {

			this.data.contentItemName = '';
			this.data.contentTypeName = '';
			this.data.repoID = '';
			this.data.fields = [];

			const docXml = Utils.appendToPathArray(this.data.xmlRootFld, ["word", "document.xml"]);
			console.log(' - document ' + docXml);
			// $.get(docXml, {}, (xml) => {
			var xml = fs.readFileSync(docXml).toString();
			const content = xml;
			var xmlDoc = this.data.parser.parseFromString(content, "text/xml");

			const cp = [];
			const sdts = xmlDoc.getElementsByTagName("w:sdt");
			// console.log(' - sdts: ' + sdts.length);
			if (sdts.length) {
				for (let idx = 0; idx < sdts.length; idx++) {
					const tags = sdts[idx].getElementsByTagName('w:tag');
					if (tags.length) {
						const field = this.getFieldTag(tags[0].getAttribute("w:val"));
						if (field.ctName && field.ctName.length && field.name && field.name.length) {
							this.data.contentTypeName = field.ctName;
							if (field.datatype !== CONSTANTS.CNT_DATA_TYPE_RITM) {
								const p = this.getContentItemPartInfo(sdts[idx], field);
								cp.push(p);
								p.then(result => {
									// console.log(' - item field ' + JSON.stringify(field));
								});
							} else {
								field.val = '';
								this.data.fields.push(field);
							}
						} else {
							console.log(field);
						}
					}
				}
			}
			Promise.all(cp)
				.then(result => {
					resolve(this.data);
				});
		});
		// });
	}

	// type, name, val, sdts
	getContentItemPartInfo(sdt, field) {

		return new Promise((resolve, reject) => {

			const wp = [];
			// Content
			const contents = sdt.getElementsByTagName('w:sdtContent');
			if (contents.length) {
				// Text
				if (field.datatype === VAL_NAME || field.datatype === VAL_DESC ||
					field.datatype === CONSTANTS.CNT_DATA_TYPE_TEXT ||
					field.datatype === CONSTANTS.CNT_DATA_TYPE_NMBR ||
					field.datatype === CONSTANTS.CNT_DATA_TYPE_DCML) {
					var texts = contents[0].getElementsByTagName('w:t');
					// console.log(texts.length);
					if (texts.length) {
						var value = '';
						for (var i = 0; i < texts.length; i++) {
							value = value + texts[i].textContent;
						}

						switch (field.name) {
							case CNT_ITEM_NAME: {
								// this.data.contentItemName = this.encodeSpecialChars(texts[0].textContent);
								this.data.contentItemName = this.encodeSpecialChars(value);
								// console.log(' - item name: ' + this.data.contentItemName);
								break;
							}
							case CNT_ITEM_DESC: {
								// this.data.contentItemDesc = this.encodeSpecialChars(texts[0].textContent);
								this.data.contentItemDesc = this.encodeSpecialChars(value);
								// console.log(' - item desc: ' + this.data.contentItemDesc);
								break;
							}
							default: {
								if (field.stName === SMRT_CNT_ITEM_FIELD) {
									field.datatype = ((field.datatype === VAL_NAME || field.datatype === VAL_DESC) ? CONSTANTS.CNT_DATA_TYPE_TEXT : field.datatype);
									// field.val = this.encodeSpecialChars(texts[0].textContent);
									field.val = this.encodeSpecialChars(value);
									// console.log(' - item field ' + JSON.stringify(field));
									this.data.fields.push(field);
								}
								break;
							}
						}
					}
				} else if (field.datatype === CONSTANTS.CNT_DATA_TYPE_RIMG) {
					const p = this.parseImageRun(contents[0]);
					wp.push(p);
					p.then(result => {
						field.val = result;
						this.data.fields.push(field);
					});
				} else if (field.datatype === CONSTANTS.CNT_DATA_TYPE_RPTH) {
					const texts = contents[0].getElementsByTagName('w:t');
					if (texts.length) {
						var value = '';
						for (var i = 0; i < texts.length; i++) {
							value = value + texts[i].textContent;
						}
						field.val = value;
						this.data.fields.push(field);
					}
				} else if (field.datatype === CONSTANTS.CNT_DATA_TYPE_BOOL) {
					const texts = contents[0].getElementsByTagName('w:t');
					if (texts.length) {
						let text = texts[0].textContent;
						// Check if it's a dropdown or checkbox
						const drpdwn = sdt.getElementsByTagName('w:dropDownList');
						if (drpdwn.length) {
							var children = drpdwn[0].children || drpdwn[0].childNodes;
							for (let di = 0; di < children.length; di++) {
								if (text === children[di].getAttribute('w:displayText')) {
									const dv = children[di].getAttribute('w:value');
									if (dv.toLowerCase() === 'true') text = true;
									else text = false;
									break;
								}
							}
						} else {
							if (text === '☒') text = true;
							else text = false;
						}
						field.val = text;
						this.data.fields.push(field);
						// console.log(' - item field ' + JSON.stringify(field));
					}
				} else if (field.datatype === CONSTANTS.CNT_DATA_TYPE_DTTM) {
					const date = sdt.getElementsByTagName('w:date');
					if (date.length) {
						const text = date[0].getAttribute('w:fullDate');
						field.val = text;
						this.data.fields.push(field);
					}
				} else if (field.datatype === CONSTANTS.CNT_DATA_TYPE_LTXT) {
					field.val = '<!DOCTYPE html>';
					this.data.fields.push(field);

					const pp = [];
					const ps = contents[0].getElementsByTagName('w:p');
					for (let pi = 0; pi < ps.length; pi++) {
						const p = this.parseLargeTextPart(ps[pi]);
						pp.push(p);
						wp.push(p);
					}

					const result = pp.reduce((accumulatePromise, crtTask) => {
						return accumulatePromise.then((result) => {
							if (result) this.updateFieldValue(field.name, result);
							return crtTask;
						});
					}, Promise.resolve());
					result.then(result => {
						this.updateFieldValue(field.name, result);
					});
				}
			}

			Promise.all(wp)
				.then(result => {
					resolve();
				});
		});
	}

	updateFieldValue(name, val) {
		let field = this.data.fields.find(item => {
			return item.name === name;
		});
		if (field) {
			field.val += val;
		} else if (this.data.references.length) {
			// It from references
			for (let idx = 0; idx < this.data.references.length; idx++) {
				field = this.data.references[idx].fields.find(item => {
					return item.name === name;
				});
				if (field) {
					field.val += val;
					break;
				}
			}
		}
		// console.log(' - item field ' + JSON.stringify(field));
	}

	getTargetFromId(id) {

		return new Promise((resolve, reject) => {

			let filepath = '';
			const docXml = Utils.appendToPathArray(this.data.xmlRootFld, ["word", "_rels", "document.xml.rels"]);
			var xml = fs.readFileSync(docXml).toString();
			// $.get(docXml, {}, (xml) => {

			const content = xml;
			var xmlDoc = this.data.parser.parseFromString(content, "text/xml");

			const rels = xmlDoc.getElementsByTagName("Relationship");
			if (rels.length) {
				for (let idx = 0; idx < rels.length; idx++) {
					if (rels[idx].getAttribute("Id") === id) {
						filepath = rels[idx].getAttribute("Target");
						break;
					}
				}
			}
			resolve(filepath);
			// });
		});
	}

	parseLargeTextPart(part) {
		return new Promise((resolve, reject) => {

			let text = '<p>';
			const ltp = [];
			var children = part.children || part.childNodes;
			for (let li = 0; li < children.length; li++) {
				const p = this.parseLargeTextRun(children[li]);
				ltp.push(p);
			}

			const result = ltp.reduce((accumulatePromise, crtTask) => {
				return accumulatePromise.then((result) => {
					if (result) text += result;
					return crtTask;
				});
			}, Promise.resolve());
			result.then(result => {
				if (result) text += result;
				text += "</p>";
				resolve(text);
			});
		});
	}

	parseLargeTextRun(run) {

		return new Promise((resolve, reject) => {

			switch (run.nodeName) {
				case 'w:r': {
					let text = '';
					const texts = run.getElementsByTagName('w:t');
					if (texts.length) {
						// Get styling
						const styles = this.getHtmlTextStyle(run);
						// Tag style (e.g. <b>)
						styles.t.forEach(style => {
							text += style.start;
						});
						text += this.encodeSpecialChars(texts[0].textContent);
						styles.t.reverse().forEach(style => {
							text += style.end;
						});
						// Style (e.g. style="color:#...")  
						if (styles.p.length) {
							let ptext = '<span style="';
							styles.p.forEach(pstyle => {
								ptext += pstyle + ';';
							});
							ptext += '">' + text + '</span>';
							text = ptext;
						}
						resolve(text);
					} else {
						// Image
						const pics = run.getElementsByTagName('w:drawing');
						if (pics.length) {
							const p = this.parseImageRun(pics[0]);
							// wp.push(p);
							p.then(result => {
								let alt = '';
								const cnvs = run.getElementsByTagName('pic:cNvPr');
								if (cnvs.length) alt = cnvs[0].getAttribute("descr");
								text = "<span>";
								text += "<img alt=\"" + this.encodeSpecialChars(alt) + "\" src=\"" + result + "\">";
								text += "</span>";
								resolve(text);
							});
						} else {
							resolve(text);
						}
					}
					break;
				}
				case 'w:hyperlink': {
					let text = '';
					const texts = run.getElementsByTagName('w:t');
					if (texts.length) {
						const rid = run.getAttribute('r:id');
						const p = this.getTargetFromId(rid);
						p.then(result => {
							if (result.length) {
								text = " <a href=\"" + result + "\">";
								// text = " <a href=\"" + result + "\" target=\"_blank\">";
								text += this.encodeSpecialChars(texts[0].textContent) + "&nbsp;";
								text += "</a>";
								resolve(text);
							}
						});
					} else {
						resolve(text);
					}
					break;
				}
				default: {
					resolve('');
					break;
				}
			}
		});
	}

	parseImageRun(rImage, fullPath = true) {

		return new Promise((resolve, reject) => {
			const blips = rImage.getElementsByTagName('a:blip');
			if (blips.length) {
				const rid = blips[0].getAttribute("r:embed");
				const p = this.getTargetFromId(rid);
				p.then(result => {
					let path = result;
					if (result.length && fullPath) {
						const pItems = result.split('/');
						if (pItems.length >= 1) {
							pItems.unshift("word");
							path = Utils.appendToPathArray(this.data.xmlRootFld, pItems);
						}
					}
					resolve(path);
				});
			} else {
				resolve('');
			}
		});
	}

	getHtmlTextStyle(run) {
		const styles = {
			p: [],
			t: []
		};

		const prs = run.getElementsByTagName("w:rPr");
		if (prs.length) {
			var children = prs[0].children || prs[0].childNodes;
			for (let idx = 0; idx < children.length; idx++) {
				const runStyle = children[idx];
				let tstyle = '';
				let pstyle = '';
				switch (runStyle.nodeName) {
					case 'w:b': {
						tstyle = 'strong';
						break;
					}
					case 'w:i': {
						tstyle = 'em';
						break;
					}
					case 'w:strike': {
						tstyle = 's';
						break;
					}
					case 'w:u': {
						tstyle = 'u';
						break;
					}
					case 'w:shd': {
						const clr = runStyle.getAttribute('w:fill');
						if (clr.length) pstyle = 'background-color:#' + clr;
						break;
					}
					case 'w:rStyle': {
						const val = runStyle.getAttribute('w:val');
						if (val.length) {
							if (val === 'Strong') tstyle = 'strong';
							else if (val === 'Emphasis') tstyle = 'em';
						}
						break;
					}
					case 'w:color': {
						const clr = runStyle.getAttribute('w:val');
						if (clr.length) pstyle = 'color:#' + clr;
						break;
					}
					case 'w:highlight': {
						const clr = runStyle.getAttribute('w:val');
						if (clr.length) pstyle = 'background-color:#' + clr;
						break;
					}
				}

				if (tstyle.length) {
					const start = '<' + tstyle + '>';
					const end = '</' + tstyle + '>';
					styles.t.push({
						start: start,
						end: end
					});
				}
				if (pstyle.length) {
					styles.p.push(pstyle);
				}
			}
		}
		return styles;
	}

	encodeSpecialChars(str) {
		return this.encodeLargeText(str);
		// if (str.length) {
		//     return str.replace(/(&#'(\d+);)/g, (match, capture, charCode) => 
		//                     String.fromCharCode(charCode));
		// }
		// return '';
	}

	encodeLargeText(text) {
		const spch = [{
				c: '&',
				s: '&amp;'
			}, {
				c: '\\',
				s: '\\\\'
			}, {
				c: '\'',
				s: '&#39;'
			}, {
				c: '"',
				s: '&quot;'
			},
			{
				c: '<',
				s: '&lt;'
			}, {
				c: '>',
				s: '&gt;'
			}
		];
		spch.forEach(item => {
			const etxt = Utils.replaceAll(text, item.c, item.s);
			text = etxt;
		});
		return text;
	}

	replaceImagePathWithAsset(val, filePath, caasID) {

		const ssrc = filePath;
		let text = val;
		const pos = text.indexOf(ssrc);
		if (pos !== -1) {
			const iId = IMG_PATH_ASSET_START + caasID + IMG_PATH_ASSET_END;
			text = text.replace(filePath, iId);
		}

		return text;
	}

	setBookmarkReference(node, bkName) {
		const lnk = node.getElementsByTagName("w:hyperlink");
		if (lnk.length) {
			lnk[0].setAttribute("w:anchor", bkName);
		}
	}

	getBookmarkReference(node) {
		const lnk = node.getElementsByTagName("w:hyperlink");
		if (lnk.length) {
			return lnk[0].getAttribute("w:anchor");
		}
		return null;
	}

	setFieldTag(field) {
		return TAG_CNT_TYPE + field.ctName + "#" + TAG_FIELD_NAME + field.name + "#" +
			TAG_DATA_TYPE + field.datatype + "#" + TAG_FUNCTION + field.stName;
	}

	getFieldTag(tag) {
		const field = {
			ctName: '',
			name: '',
			datatype: '',
			stName: ''
		};
		const els = [TAG_CNT_TYPE, TAG_FIELD_NAME, TAG_DATA_TYPE, TAG_FUNCTION];
		els.forEach(el => {
			let pos = tag.indexOf(el);
			if (pos !== -1) {
				let val = tag.substr(pos + el.length, tag.length);
				pos = val.indexOf("#");
				if (pos !== -1) val = val.substr(0, pos);
				switch (el) {
					case TAG_CNT_TYPE:
						field.ctName = val;
						break;
					case TAG_FIELD_NAME:
						field.name = val;
						break;
					case TAG_DATA_TYPE:
						field.datatype = val;
						break;
					case TAG_FUNCTION:
						field.stName = val;
						break;
				}
			}
		});
		return field;
	}

	// const tblProps = {cols:{w:[965, 3983, 4403]}}
	createTable(xmlDoc, tblProps) {

		const tblNode = xmlDoc.createElement("w:tbl");
		let w = 0;
		tblProps.cols.w.forEach(colw => {
			w += colw;
		});
		// Properties
		const tblPrNode = xmlDoc.createElement("w:tblPr");
		const tblstNode = xmlDoc.createElement("w:tblStyle");
		tblstNode.setAttribute("w:val", "TableGrid");
		tblPrNode.appendChild(tblstNode);
		const tblwNode = xmlDoc.createElement("w:tblW");
		tblwNode.setAttribute("w:w", w.toString());
		tblwNode.setAttribute("w:type", "dxa");
		tblPrNode.appendChild(tblwNode);

		const tblbdNode = xmlDoc.createElement("w:tblBorders");
		const tblbdtNode = xmlDoc.createElement("w:top");
		tblbdtNode.setAttribute("w:val", "single");
		tblbdtNode.setAttribute("w:sz", "4");
		tblbdtNode.setAttribute("w:space", "0");
		tblbdtNode.setAttribute("w:color", "auto");
		tblbdNode.appendChild(tblbdtNode);
		const tblbdlNode = xmlDoc.createElement("w:left");
		tblbdlNode.setAttribute("w:val", "single");
		tblbdlNode.setAttribute("w:sz", "4");
		tblbdlNode.setAttribute("w:space", "0");
		tblbdlNode.setAttribute("w:color", "auto");
		tblbdNode.appendChild(tblbdlNode);
		const tblbdbNode = xmlDoc.createElement("w:bottom");
		tblbdbNode.setAttribute("w:val", "single");
		tblbdbNode.setAttribute("w:sz", "4");
		tblbdbNode.setAttribute("w:space", "0");
		tblbdbNode.setAttribute("w:color", "auto");
		tblbdNode.appendChild(tblbdbNode);
		const tblbdrNode = xmlDoc.createElement("w:right");
		tblbdrNode.setAttribute("w:val", "single");
		tblbdrNode.setAttribute("w:sz", "4");
		tblbdrNode.setAttribute("w:space", "0");
		tblbdrNode.setAttribute("w:color", "auto");
		tblbdNode.appendChild(tblbdrNode);
		const tblbdihNode = xmlDoc.createElement("w:insideH");
		tblbdihNode.setAttribute("w:val", "single");
		tblbdihNode.setAttribute("w:sz", "4");
		tblbdihNode.setAttribute("w:space", "0");
		tblbdihNode.setAttribute("w:color", "auto");
		tblbdNode.appendChild(tblbdihNode);
		const tblbdivNode = xmlDoc.createElement("w:insideV");
		tblbdivNode.setAttribute("w:val", "single");
		tblbdivNode.setAttribute("w:sz", "4");
		tblbdivNode.setAttribute("w:space", "0");
		tblbdivNode.setAttribute("w:color", "auto");
		tblbdNode.appendChild(tblbdivNode);
		tblPrNode.appendChild(tblbdNode);

		const tblkNode = xmlDoc.createElement("w:tblLook");
		tblkNode.setAttribute("w:val", "04A0");
		tblkNode.setAttribute("w:firstRow", "1");
		tblkNode.setAttribute("w:lastRow", "0");
		tblkNode.setAttribute("w:firstColumn", "1");
		tblkNode.setAttribute("w:lastColumn", "0");
		tblkNode.setAttribute("w:noHBand", "0");
		tblkNode.setAttribute("w:noVBand", "1");
		tblPrNode.appendChild(tblkNode);
		tblNode.appendChild(tblPrNode);
		// Grid (3/2 cols)
		const tblGrNode = xmlDoc.createElement("w:tblGrid");
		for (let idx = 0; idx < tblProps.cols.w.length; idx++) {
			const tblgcNode = xmlDoc.createElement("w:gridCol");
			tblgcNode.setAttribute("w:w", tblProps.cols.w[idx].toString());
			tblGrNode.appendChild(tblgcNode);
		}

		tblNode.appendChild(tblGrNode);

		return tblNode;
	}

	createTableRow(xmlDoc, tblProps, nodes, isHdr = false) {

		const tblRowNode = xmlDoc.createElement("w:tr");
		tblRowNode.setAttribute("w:rsidR", "00CA621B");
		tblRowNode.setAttribute("w:rsidTr", "00FA2247");

		// Column 1
		const tblCol1Node = this.createTableRowColumn(xmlDoc, tblProps.cols.w[0], nodes.lbl, isHdr);
		tblRowNode.appendChild(tblCol1Node);
		// Column 2
		const tblCol2Node = this.createTableRowColumn(xmlDoc, tblProps.cols.w[1], nodes.sdt, isHdr);
		tblRowNode.appendChild(tblCol2Node);
		// Column 3
		if (tblProps.cols.w.length > 2) {
			const tblCol3Node = this.createTableRowColumn(xmlDoc, tblProps.cols.w[2], nodes.note, isHdr);
			tblRowNode.appendChild(tblCol3Node);
		}
		return tblRowNode;
	}

	createTableRowColumn(xmlDoc, width, childNode, isHdr) {

		// Column
		const tblRowColNode = xmlDoc.createElement("w:tc");
		const tblCPrNode = xmlDoc.createElement("w:tcPr");
		const tblCwNode = xmlDoc.createElement("w:tcW");
		tblCwNode.setAttribute("w:w", width.toString());
		tblCwNode.setAttribute("w:type", "dxa");
		tblCPrNode.appendChild(tblCwNode);
		if (isHdr) {
			const tblCshNode = xmlDoc.createElement("w:shd");
			tblCshNode.setAttribute("w:val", "clear");
			tblCshNode.setAttribute("w:color", "auto");
			tblCshNode.setAttribute("w:fill", "F2F2F2");
			// tblCshNode.setAttribute("w:themeFill", "background1");
			// tblCshNode.setAttribute("w:themeFillShade", "F2");
			tblCPrNode.appendChild(tblCshNode);
		}
		tblRowColNode.appendChild(tblCPrNode);
		// Child
		if (childNode) tblRowColNode.appendChild(childNode);

		return tblRowColNode;
	}
}

module.exports = MSWord;