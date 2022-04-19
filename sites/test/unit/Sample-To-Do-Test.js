/**
 * Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
 * Licensed under the Universal Permissive License v 1.0 as shown at http://oss.oracle.com/licenses/upl.
 */
define(function() {
	"use strict";
	/* global chai */
	var expect = chai.expect;

	describe('Sample-To-Do', function() {
		var viewModel;
		var ko;

		before(function(done) {
			require(['sitesMockAPI', 'sitesMockData', 'components/Sample-To-Do/assets/render', 'jquery', 'knockout'], function(sitesMockAPI, sitesMockData, compFactory, $, knockout) {
				ko = knockout;

				var compArgs = {
					SitesSDK: sitesMockAPI,
					mode: sitesMockData.viewMode,
					id: sitesMockData.componentId
				};

				// create a new component
				compFactory.createComponent(compArgs, function(newComp) {
					viewModel = newComp.viewModel;
					done();
				});


			});
		});

		function clearTodo() {
			viewModel.todo.removeAll();
		}

		describe('#add(description)', function() {

			it('should add only one item', function() {
				clearTodo();
				viewModel.add('item1');
				expect(JSON.parse(ko.toJSON(viewModel.todo()))).to.have.lengthOf(1);
			});

			it('should add an item with the given description', function() {
				clearTodo();
				viewModel.add('item1');
				expect((function() {
					var items = JSON.parse(ko.toJSON(viewModel.todo()));
					return items.filter(function(item) {
						return item.desc === 'item1';
					}).length > 0;
				})()).to.be.true;
			});

			it('should add an item without completing it', function() {
				clearTodo();
				viewModel.add('item1');
				expect((function() {
					var items = JSON.parse(ko.toJSON(viewModel.todo()));
					return items.filter(function(item) {
						return item.desc === 'item1' && item.completed === false;
					}).length > 0;
				})()).to.be.true;
			});

		});

		describe('#delete(item)', function() {

			it('should remove the item', function() {
				clearTodo();
				viewModel.add('item1');
				viewModel.delete(viewModel.todo()[0]);
				expect(JSON.parse(ko.toJSON(viewModel.todo()))).to.have.lengthOf(0);
			});

			it('should remove only the given item', function() {
				clearTodo();
				viewModel.add('item1');
				viewModel.add('item2');
				viewModel.add('item3');
				viewModel.add('item4');

				expect((function() {

					var item = viewModel.getItem('item1');
					// delete
					viewModel.delete(item);
					return  !viewModel.getItem('item1');

				})()).to.be.true;
			});


			it('should reduce the number of items by 1', function() {
				clearTodo();
				viewModel.add('item1');
				viewModel.add('item2');
				viewModel.add('item3');
				viewModel.add('item4');
				
				var item = viewModel.getItem('item1');
				// delete
				viewModel.delete(item);
				expect(JSON.parse(ko.toJSON(viewModel.todo()))).to.have.lengthOf(3);
			});


		});


		describe('#title()', function() {
			it('should return "To-Do" by default', function() {
				expect("To-Do").to.equal(viewModel.title());
			});
		});

		describe('#placeholder()', function() {
			it('should return "Enter a task" by default', function() {
				expect("Enter a task").to.equal(viewModel.placeholder());
			});
		});

	});
});
