define(function (require) {
  return function DateHistogramAggType(timefilter, config, Private) {
    var _ = require('lodash');
    var moment = require('moment');
    var BucketAggType = Private(require('components/agg_types/buckets/_bucket_agg_type'));
    var TimeBuckets = Private(require('components/time_buckets/time_buckets'));
    var createFilter = Private(require('components/agg_types/buckets/create_filter/date_histogram'));

    var tzOffset = moment().format('Z');

    require('filters/field_type');

    return new BucketAggType({
      name: 'date_histogram',
      title: 'Date Histogram',
      ordered: {
        date: true
      },
      makeLabel: function (agg) {
        var output = this.params.write(agg);
        var params = output.params;
        return params.field + ' per ' + (output.metricScaleText || output.bucketInterval.description);
      },
      createFilter: createFilter,
      decorateAggConfig: function () {
        var buckets;
        return {
          buckets: {
            configurable: true,
            get: function () {
              if (buckets) return buckets;

              buckets = new TimeBuckets();
              buckets.setInterval(_.get(this, ['params', 'interval']));
              buckets.setBounds(timefilter.getActiveBounds());
              return buckets;
            }
          }
        };
      },
      params: [
        {
          name: 'field',
          filterFieldTypes: 'date',
          default: function (agg) {
            return agg.vis.indexPattern.timeFieldName;
          }
        },

        {
          name: 'interval',
          type: 'optioned',
          default: 'auto',
          options: Private(require('components/agg_types/buckets/_interval_options')),
          editor: require('text!components/agg_types/controls/interval.html'),
          onRequest: function (agg) {
            // flag that prevents us from clobbering on subsequest calls to write()
            agg.buckets._sentToEs = true;
            agg.buckets.setBounds(timefilter.getActiveBounds());
          },
          write: function (agg, output) {
            if (!agg.buckets._sentToEs) {
              agg.buckets.setBounds(timefilter.getActiveBounds());
            }

            agg.buckets.setInterval(agg.params.interval);

            var interval = agg.buckets.getInterval();
            output.bucketInterval = interval;
            output.params.interval = interval.expression;
            output.params.pre_zone = tzOffset;
            output.params.pre_zone_adjust_large_interval = true;

            var scaleMetrics = interval.scaled && interval.scale < 1;
            if (scaleMetrics) {
              scaleMetrics = _.every(agg.vis.aggs.bySchemaGroup.metrics, function (agg) {
                return agg.type.name === 'count' || agg.type.name === 'sum';
              });
            }

            if (scaleMetrics) {
              output.metricScale = interval.scale;
              output.metricScaleText = interval.preScaled.description;
            }
          }
        },

        {
          name: 'format'
        },

        {
          name: 'min_doc_count',
          default: 1
        },

        {
          name: 'extended_bounds',
          default: {},
          write: function (agg, output) {
            var val = agg.params.extended_bounds;

            if (val.min != null || val.max != null) {
              output.params.extended_bounds = {
                min: moment(val.min).valueOf(),
                max: moment(val.max).valueOf()
              };

              return;
            }

            var bounds = timefilter.getActiveBounds();
            if (bounds) {
              output.params.extended_bounds = {
                min: moment(bounds.min).valueOf(),
                max: moment(bounds.max).valueOf()
              };
            }
          }
        }
      ]
    });
  };
});
