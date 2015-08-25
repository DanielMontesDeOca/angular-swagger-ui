/*
 * Orange angular-swagger-ui - v0.2.1
 *
 * (C) 2015 Orange, all right reserved
 * MIT Licensed
 */
'use strict';

angular
	.module('swaggerUi')
	.service('swaggerJsonParser', ['$q', '$sce', '$location', 'swaggerModel', function($q, $sce, $location, swaggerModel) {

		var swagger,
			trustedSources;

		function trustHtml(text) {
			var trusted = text;
			if (typeof text === 'string' && trustedSources) {
				trusted = $sce.trustAsHtml(text);
			}
			// else ngSanitize MUST be added to app
			return trusted;
		}

    /**
     * recursively builds form object from params
     */
    function buildFormFromParams(params) {
      var form = {};
      for (var i = 0; i < params.length; i++) {
        var p = params[i];
        switch (p.subtype) {
          case 'object':
            form[p.id] = buildFormFromParams(p.parameters);
            break;
          case 'array':
            form[p.id] = [];
            break;
          case 'enum':
            form[p.id] = p.enum[0];
            break;
          default:
            form[p.id] = null;
            break;
        }
      }
      return form;
    }

		/**
		 * parses swagger description to ease HTML generation
		 */
		function parseJsonSwagger2(deferred, parseResult) {

			var operationId = 0,
				paramId = 0,
				map = {},
				form = {},
				resources = [],
				infos = swagger.info,
				openPath = $location.search().open;

			// build URL params
			swagger.schemes = [swagger.schemes && swagger.schemes[0] ? swagger.schemes[0] : $location.protocol()];
			swagger.host = swagger.host || $location.host();

			// build main infos
			infos.scheme = swagger.schemes[0];
			infos.basePath = swagger.basePath;
			infos.host = swagger.host;
			infos.description = trustHtml(infos.description);

			// parse resources
			if (!swagger.tags) {
				resources.push({
					name: 'default',
					open: true
				});
				map['default'] = 0;
			} else {
				for (var i = 0, l = swagger.tags.length; i < l; i++) {
					var tag = swagger.tags[i];
					resources.push(tag);
					map[tag.name] = i;
				}
			}
			// parse operations
			for (var path in swagger.paths) {
				for (var httpMethod in swagger.paths[path]) {
					var operation = swagger.paths[path][httpMethod];
					//TODO manage 'deprecated' operations ?
					operation.id = operationId;
					operation.description = trustHtml(operation.description);
					operation.consumes = operation.consumes || swagger.consumes;
					operation.produces = operation.produces || swagger.produces;
					form[operationId] = {
						contentType: operation.consumes && operation.consumes.length === 1 ? operation.consumes[0] : 'application/json',
						responseType: 'application/json'
					};
					operation.httpMethod = httpMethod;
					operation.path = path;
					// parse operation's parameters
					for (var j = 0, params = operation.parameters || [], k = params.length; j < k; j++) {
						//TODO manage 'collectionFormat' (csv, multi etc.) ?
						//TODO manage constraints (pattern, min, max etc.) ?
						var param = params[j];
						if (param.$ref) {
							var parts = param.$ref.replace('#/', '').split('/');
							param = swagger[parts[0]][parts[1]];
							params[j] = param;
						}
						param.id = paramId;
						param.type = swaggerModel.getType(param);
						param.description = trustHtml(param.description);
						if (param.items && param.items.enum) {
							param.enum = param.items.enum;
							param.default = param.items.default;
						}
						param.subtype = param.enum ? 'enum' : param.type;
						// put param into form scope
						form[operationId][param.name] = param.default || '';
						if (param.schema) {
							param.schema.display = 1; // display schema
							param.schema.json = swaggerModel.generateSampleJson(swagger, param.schema);
							param.schema.model = $sce.trustAsHtml(swaggerModel.generateModel(swagger, param.schema));
						}
						if (param.in === 'body') {
							operation.consumes = operation.consumes || ['application/json'];
              if(operation.consumes[0] === 'application/json') {
                param.parameters = swaggerModel.getBodySchemaAsParameters(swagger, param.schema);
                form[operationId][param.name] = buildFormFromParams(param.parameters);
              }
						}
						paramId++;
					}
					// parse operation's responses
					if (operation.responses) {
						for (var code in operation.responses) {
							//TODO manage headers ?
							var resp = operation.responses[code];
							resp.description = trustHtml(resp.description);
							if (resp.schema) {
								resp.schema.json = swaggerModel.generateSampleJson(swagger, resp.schema);
								if (resp.schema.type === 'object' || resp.schema.type === 'array' || resp.schema.$ref) {
									resp.display = 1; // display schema
									resp.schema.model = $sce.trustAsHtml(swaggerModel.generateModel(swagger, resp.schema));
								} else if (resp.schema.type === 'string') {
									delete resp.schema;
								}
								if (code === '200' || code === '201') {
									operation.responseClass = resp;
									operation.responseClass.display = 1;
									operation.responseClass.status = code;
									delete operation.responses[code];
								} else {
									operation.hasResponses = true;
								}
							} else {
								operation.hasResponses = true;
							}
						}
					}
					operation.tags = operation.tags || ['default'];
					// map operation to resource
					var tag = operation.tags[0];
					if (typeof map[tag] === 'undefined') {
						map[tag] = resources.length;
						resources.push({
							name: tag
						});
					}
					var res = resources[map[operation.tags[0]]];
					operation.open = openPath && openPath === operation.operationId || openPath === res.name + '*';
					res.operations = res.operations || [];
					res.operations.push(operation);
					if (operation.open) {
						res.open = true;
					}
					operationId++;
				}
			}
			// cleanup resources
			for (var i = 0; i < resources.length; i++) {
				var res = resources[i],
					operations = resources[i].operations;

				res.open = res.open || openPath === res.name || openPath === res.name + '*';
				if (!operations || (operations && operations.length === 0)) {
					resources.splice(i, 1);
				}
			}
			// sort resources alphabeticaly
			resources.sort(function(a, b) {
				if (a.name > b.name) {
					return 1;
				} else if (a.name < b.name) {
					return -1;
				}
				return 0;
			});
			// clear cache
			swaggerModel.clearCache();
			parseResult.infos = infos;
			parseResult.resources = resources;
			parseResult.form = form;
			deferred.resolve();
		}

		/**
		 * Module entry point
		 */
		this.execute = function(contentType, data, isTrustedSources, parseResult) {
			var deferred = $q.defer();
			if (contentType === 'application/json') {
				swagger = data;
				trustedSources = isTrustedSources;
				try {
					parseJsonSwagger2(deferred, parseResult);
				} catch (e) {
					deferred.reject({
						code: '500',
						message: 'failed to parse swagger: ' + e.message
					});
				}
			} else {
				deferred.resolve();
			}
			return deferred.promise;
		};

	}]);