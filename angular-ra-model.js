'use strict';
// Source: src/angular-ra-model.js
angular.module('ra.model', ['ra.model.services']);

// Source: src/services/model.js
(function() {
// Snippet taken from http://prototypejs.org
  function argumentNames(func) {
    var names = func.toString()
                    .match(/^[\s\(]*function[^(]*\(([^)]*)\)/)[1]
                    .replace(/\/\/.*?[\r\n]|\/\*(?:.|[\r\n])*?\*\//g, '')
                    .replace(/\s+/g, '')
                    .split(',');

    return names.length === 1 && !names[0] ? [] : names;
  }

  function extend(obj) {
    angular.forEach(Array.prototype.slice.call(arguments, 1), function(source) {
      if (obj && source) {
        for (var prop in source) {
          obj[prop] = source[prop];
        }
      }
    });

    return obj;
  }

  angular.module('ra.model.services', [])

    .run(function($rootScope, raModel) {
      // TODO: add configuration option to disable
      // convenience method polluting $rootScope
      $rootScope.model = function(name, config) {
        var model = new raModel(this, name, config);

        this[name] = model;

        return model;
      };
    })

    .factory('raModel', function($rootScope, $cacheFactory, $location, $q) {
      var model_cache = $cacheFactory('raModel');

      // Constructor
      var raModel = function raModel(scope, name, config) {
        if (!(this instanceof raModel) ) {
          return new raModel(scope, name, config);
        }

        var args = Array.prototype.slice.call(arguments),
            model;

        // Optional first parameter
        if (!angular.isObject(args[0]) && args[0] !== false) {
          args.unshift($rootScope);
        }

        scope  = args[0];
        name   = args[1];
        config = args[2] || {};

        // Extend model with config
        this.extend(config);

        // Set privileged vars
        this.name               = name;
        this.is                 = config.is || {};
        this.opts               = config.opts || {};
        this.attr_accessible    = config.attr_accessible || [];
        this.attr_protected     = config.attr_protected || [];
        this.resource_attribute = config.resource_attribute || 'items';

        // Privileged accessors
        this._scope = function() {
          return scope;
        };
      };

      // Public methods
      raModel.prototype.init = function(params) {
        if (angular.isFunction(this.beforeInit)) {
          this.beforeInit(params);
        }

        var call = this.get(params);

        if (angular.isFunction(this.afterInit)) {
          this.afterInit(call, params);
        }

        this.is.inited = true;

        return call;
      };

      raModel.prototype.get = function(passed_params) {
        if (this.opts.cache) {
          var cache = this.cached();

          if (cache) {
            $q.when(cache)
              .then(function() {
                this.success(cache);
              }.bind(this));

            return cache;
          }
        }

        var args = [],
            call,
            params;

        if (this.params) {
          if (angular.isFunction(this.params)) {
            params = this.params();
          } else {
            params = this.params;
          }
        }

        args.push(
          angular.extend({}, params, passed_params),
          this._setHeaders.bind(this)
        );

        if (this.resource) {
          var resource = this.resource,
              context  = this;

          if (this.resource_method) {
            resource = resource[this.resource_method];
            context  = this.resource;
          }

          call = resource.apply(context, args);

          if (call && call.$promise) {
            this.$promise = call.$promise.then(
              this.success.bind(this),
              this.error.bind(this)
            );
          }
        } else if (angular.isFunction(this.config.get)) {
          call = this.config.get.apply(this, args);
        }

        this.is.loading = true;

        return call;
      };

      raModel.prototype.update = function() {
        var deferred = $q.defer();

        var success = function updateSuccess(response) {
          if (angular.isFunction(this.updateSuccess)) {
            this.updateSuccess(response);
          }

          this.is.updating   = false;
          this.is.processing = false;

          this.snapshot();

          if (this._scope()) {
            this._scope().$broadcast(this.name + ':updateComplete', response);
            this._scope().$broadcast(this.name + ':updateSuccess',  response);
          }

          deferred.resolve(response);
        };

        var error = function updateError(response) {
          if (angular.isFunction(this.updateError)) {
            this.updateError(response);
          }

          this.is.updating   = false;
          this.is.processing = false;

          if (this._scope()) {
            this._scope().$broadcast(this.name + ':updateComplete', response);
            this._scope().$broadcast(this.name + ':updateError',    response);
          }

          deferred.reject(response);
        };

        if (angular.isFunction(this.$update)) {
          this.is.updating   = true;
          this.is.processing = true;

          this.$update.call(this.getData(), success.bind(this), error.bind(this));
        }

        return deferred.promise;
      };

      raModel.prototype.success = function(response) {
        this._setAttrs(response);

        if (this.resource_set !== false) {
          if (angular.isArray(response)) {
            this[this.resource_attribute] = response;
          } else {
            extend(this, response);
          }
        }

        this.is.loaded  = true;
        this.is.loading = false;

        if (angular.isFunction(this.config.success)) {
          this.config.success.call(this, response, this.$headers);
        }

        this.snapshot();

        if (this.opts.cache &&
            this.opts.cache.set !== false) {
          this.cache(response);
        }

        if (this._scope()) {
          this._scope().$broadcast(this.name + ':success',  response, this.$headers);
          this._scope().$broadcast(this.name + ':complete', response, this.$headers);
        }

        return response;
      };

      raModel.prototype.error = function(response) {
        this.is.loaded  = true;
        this.is.loading = false;

        if (angular.isFunction(this.config.error)) {
          this.config.error.call(this, response);
        }

        if (this._scope()) {
          this._scope().$broadcast(this.name + ':error',    response);
          this._scope().$broadcast(this.name + ':complete', response);
        }

        return $q.reject(response);
      };

      raModel.prototype.cache = function(data, key) {
        // Put in cache object
        model_cache.put(this._cacheKey(key), data);
      };

      raModel.prototype.cached = function(key) {
        // Return cache object
        return model_cache.get(this._cacheKey(key));
      };

      raModel.prototype.snapshot = function() {
        // Snapshot data
        this._original = this.getData();
      };

      raModel.prototype.reset = function() {
        // Reset data
        if (angular.isArray(this._original)) {
          angular.forEach(this[this.resource_attribute], function(resource) {
            for (var i = 0, len = this._original.length; i < len; i++) {
              if (angular.isObject(resource) && angular.isObject(this._original[i]) &&
                  resource.id === this._original[i].id) {
                angular.extend(resource, angular.copy(this._original[i]));
                break;
              }
            }
          }.bind(this));
        } else {
          angular.extend(this, angular.copy(this._original));
        }
      };

      raModel.prototype.flush = function(key) {
        // Flush cache
        model_cache.remove(this._cacheKey(key));
      };

      raModel.prototype.extend = function(config) {
        var self = this;

        // Default config
        config = config || {};

        // Extend config
        if (this.config) {
          extend(this.config, config);
        } else {
          this.config = config;
        }

        // Go through each prop in config (including inherited props/methods) and extend the model with it
        for (var prop in config) {
          var value = config[prop];

          // Extending methods
          if (angular.isFunction(value)) {
            // Override existing method if first argument name is '$super'
            if (argumentNames(value)[0] === '$super') {
              var $super = this[prop],
                  method = angular.copy(value);

              // Create a new method and pass original method into the new method
              value = function() {
                var args = Array.prototype.slice.call(arguments, 0);
                args.unshift($super.bind(self));

                return method.apply(self, args);
              };

              this[prop] = value;
            }

            // Otherwise, only override method if not part of raModel.prototype
            else if (angular.isUndefined(raModel.prototype[prop]) ||
                     angular.isDefined(raModel.prototype[prop]) && raModel.prototype[prop] === Object.prototype[prop]) {
              this[prop] = value;
            }
          }

          // Extending properties
          else {
            this[prop] = value;
          }
        }
      };

      raModel.prototype.data = raModel.prototype.getData = function() {
        var self = this,
            data;

        if (angular.isArray(self[self.resource_attribute])) {
          data = [];

          angular.forEach(self[self.resource_attribute], function(resource) {
            var resource_data = {};

            angular.forEach(self._getAttrs(), function(attr) {
              if (attr in resource) {
                resource_data[attr] = angular.copy(resource[attr]);
              }
            });

            data.push(resource_data);
          });
        } else {
          data = {};

          angular.forEach(self._getAttrs(), function(attr) {
            if (attr in self) {
              data[attr] = angular.copy(self[attr]);
            }
          });
        }

        return data;
      };

      // Privileged methods
      raModel.prototype._setHeaders = function(response, headers) {
        this.$headers = headers;

        this.$headers.parse = function(key) {
          return angular.fromJson(this(key));
        };
      };

      raModel.prototype._setAttrs = function(response) {
        var obj;

        if (angular.isArray(response) && response.length > 0) {
          obj = response[0];
        } else {
          obj = response;
        }

        if (angular.isObject(obj)) {
          this._attrs = [];

          // TODO: might have to refactor this for backwards compatibility
          var keys = Object.keys(obj).concat(this.attr_accessible),
              self = this;

          angular.forEach(keys, function(key) {
            if (key) {
              var f = key.charAt(0);

              if (f !== '$' && f !== '_' && self._attrs.indexOf(key) === -1 && self.attr_protected.indexOf(key) === -1) {
                self._attrs.push(key);
              }
            }
          });
        }
      };

      raModel.prototype._getAttrs = function() {
        if (angular.isArray(this._attrs) && this._attrs.length > 0) {
          return this._attrs;
        }

        else if (angular.isArray(this.attr_accessible) && this.attr_accessible.length > 0) {
          return this.attr_accessible;
        }

        return [];
      };

      raModel.prototype._cacheKey = function(key) {
        var k = [];

        if (key) {
          k.push(key);
        } else if (this.opts.cache.key !== true) {
          k.push(this.opts.cache.key);
        } else {
          k.push($location.path());
        }

        k.push(this.name);

        return k.join('|');
      };

      return raModel;
    });

})();
