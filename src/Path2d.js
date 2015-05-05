(function() {
    var isPath2D = typeof Path2D === 'function',
        isPath2DaddPath = isPath2D && typeof Path2D.prototype.addPath === 'function';

    if (!isPath2D || !isPath2DaddPath) {
        // Include the SVG path parser.
        //= svgpath.js
        function Path_(arg) {
          this.ops_ = [];
          if (arg == undefined) {
            return;
          }
          if (typeof arg === 'string') {
            try {
              this.ops_ = L.gmxUtil.SVGpath.parse(arg);
            } catch(e) {
              // Treat an invalid SVG path as an empty path.
            }
          } else if (arg.hasOwnProperty('ops_')) {
            this.ops_ = arg.ops_.slice(0);
          } else {
            throw 'Error: ' + typeof arg + 'is not a valid argument to Path';
          }
        };

        function createFunction(name) {
          return function() {
            this.ops_.push({type: name, args: Array.prototype.slice.call(arguments, 0)});
          };
        }

        // Path methods that map simply to the CanvasRenderingContext2D
        var simple_mapping = [
            'moveTo', 'lineTo', 'rect',
            'arc', 'arcTo', 'ellipse', 'quadraticCurveTo', 'bezierCurveTo',
            'closePath',
            'isPointInPath', 'isPointInStroke'
        ].map(function(name) {
            Path_.prototype[name] = createFunction(name);
        });

        // Replace methods on CanvasRenderingContext2D with ones that understand Path2D.
        original_fill = CanvasRenderingContext2D.prototype.fill;
        CanvasRenderingContext2D.prototype.fill = function(arg) {
          if (arg instanceof Path_) {
            this.beginPath();
            for (var i = 0, len = arg.ops_.length; i < len; i++) {
              var op = arg.ops_[i];
              CanvasRenderingContext2D.prototype[op.type].apply(this, op.args);
            }
            original_fill.apply(this, Array.prototype.slice.call(arguments, 1));
          } else {
            original_fill.apply(this, arguments);
          }
        }

        original_stroke = CanvasRenderingContext2D.prototype.stroke;
        CanvasRenderingContext2D.prototype.stroke = function(arg) {
          if (arg instanceof Path_) {
            this.beginPath();
            for (var i = 0, len = arg.ops_.length; i < len; i++) {
              var op = arg.ops_[i];
              CanvasRenderingContext2D.prototype[op.type].apply(this, op.args);
            }
            original_stroke.call(this);
          } else {
            original_stroke.call(this);
          }
        }

        original_clip = CanvasRenderingContext2D.prototype.clip;
        CanvasRenderingContext2D.prototype.clip = function(arg) {
          if (arg instanceof Path_) {
            // Note that we don't save and restore the context state, since the
            // clip region is part of the state. Not really a problem since the
            // HTML 5 spec doesn't say that clip(path) doesn't affect the current
            // path.
            this.beginPath();
            for (var i = 0, len = arg.ops_.length; i < len; i++) {
              var op = arg.ops_[i];
              CanvasRenderingContext2D.prototype[op.type].apply(this, op.args);
            }
            original_clip.apply(this, Array.prototype.slice.call(arguments, 1));
          } else {
            original_clip.apply(this, arguments);
          }
        }

        original_is_point_in_path = CanvasRenderingContext2D.prototype.isPointInPath;
        CanvasRenderingContext2D.prototype.isPointInPath = function(arg) {
          if (arg instanceof Path_) {
            this.beginPath();
            for (var i = 0, len = arg.ops_.length; i < len; i++) {
              var op = arg.ops_[i];
              CanvasRenderingContext2D.prototype[op.type].apply(this, op.args);
            }
            return original_is_point_in_path.apply(this, Array.prototype.slice.call(arguments, 1));
          } else {
            return original_is_point_in_path.apply(this, arguments);
          }
        };

        original_is_point_in_stroke = CanvasRenderingContext2D.prototype.isPointInStroke;
        CanvasRenderingContext2D.prototype.isPointInStroke = function(arg) {
          if (arg instanceof Path_) {
            this.beginPath();
            for (var i = 0, len = arg.ops_.length; i < len; i++) {
              var op = arg.ops_[i];
              CanvasRenderingContext2D.prototype[op.type].apply(this, op.args);
            }
            return original_is_point_in_stroke.apply(this, Array.prototype.slice.call(arguments, 1));
          } else {
            return original_is_point_in_stroke.apply(this, arguments);
          }
        }

        // Add addPath method to Path2D.
        Path_.prototype['addPath'] = function(path, tr) {
          var hasTx = false;
          if (tr) {
            hasTx = true;
            this.ops_.push({type: 'save', args: []});
            this.ops_.push({type: 'transform', args: [tr.a, tr.b, tr.c, tr.d, tr.e, tr.f]});
          }
          this.ops_ = this.ops_.concat(path.ops_);
          if (hasTx) {
            this.ops_.push({type: 'restore', args: []});
          }
        }

        // Set up externs.
        Path2D = Path_;
    }
})();
