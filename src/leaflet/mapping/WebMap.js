import '../core/Base';
import L from "leaflet";
import jsonsql from "jsonsql";
import proj4 from "proj4";
import {FetchRequest as Request} from '../../common/util/FetchRequest';
import SuperMap from '../../common/SuperMap';
import {CartoCSSToLeaflet} from '../overlay/carto/CartoCSSToLeaflet' ;
import {NonEarthCRS} from "../core/NonEarthCRS";
import {UniqueThemeLayer} from "../overlay/UniqueThemeLayer";
import {RangeThemeLayer} from "../overlay/RangeThemeLayer";
import {featureService} from "../services/FeatureService";
import {DataFormat} from '../../common/REST';
import ServerFeature from '../../common/iServer/ServerFeature';
import {UnicodeMarker} from '../core/UnicodeMarker';

/**
 * @class L.supermap.webmap
 * @classdesc 对接iPortal/Online地图类。
 * @extends L.LayerGroup{@linkdoc-leaflet/#layergroup}
 * @param id - {number}iPortal/Online地图id。
 * @param options - {Object} 可选参数。如：<br>
 *        map - {string} 地图容器id。<br>
 *        server - {string} iPortal/Online服务地址。默认为 http://www.supermapol.com <br>
 *        featureLayerPopupEnable - {boolean} 是否启动要素图层提示框。<br>
 *        featureLayerPopup - {string} 提示框提示信息。<br>
 *        credentialValue - {string} 证书值。<br>
 *        credentialKey - {string} 证书密钥。<br>
 *        attribution - {string} 版权信息。
 */
export var WebMap = L.LayerGroup.extend({

    options: {
        map: 'map',
        server: 'http://www.supermapol.com',
        featureLayerPopupEnable: true,
        featureLayerPopup: null,
        credentialValue: null,
        credentialKey: 'key',
        attribution: "Map Data <span>© <a href='http://www.supermapol.com'>SuperMap Online</a></span> with <span>© <a href='http://iclient.supermapol.com' target='_blank'>SuperMap iClient</a></span>"
    },

    /**
     * @private
     * @function L.supermap.webmap.prototype.defaultFeatureLayerPopup
     * @description 默认图层弹出框
     * @param layer -{L.Layer} 指定图层
     * @return {string} 图层弹出框内容
     */
    defaultFeatureLayerPopup: function (layer) {
        return layer.feature.properties.attributes.title + ":" + layer.feature.properties.attributes.description;
    },

    initialize: function (id, options) {
        this._layers = {};
        L.setOptions(this, options);
        this.id = id;
        this.load();
        this.cartoCSSToLeaflet = new CartoCSSToLeaflet();
    },

    /**
     * @private
     * @function L.supermap.webmap.prototype.load
     * @description 登陆后添加地图图层
     */
    load: function () {
        if (this.options.server.indexOf('http://') < 0 && this.options.server.indexOf('https://') < 0) {
            this.options.server = "http://" + this.options.server;
        }
        var mapUrl = this.options.server + '/web/maps/' + this.id + '.json';
        if (this.options.credentialValue) {
            mapUrl += ('?' + this.options.credentialKey + '=' + this.options.credentialValue);
        }
        var me = this;
        Request.get(mapUrl).then(function (response) {
            return response.json()
        }).then(function (jsonObj) {
            if (!jsonObj) {
                return;
            }
            var layers = jsonObj.layers;
            me.mapInfo = jsonObj;
            me.createLayersByJson(layers);
        });
    },

    /**
     * @private
     * @function L.supermap.webmap.prototype.addLayerWrapper
     * @description 添加图层容器
     * @param layer - {L.Layer} 待添加的图层
     * @param isBaseLayer -{boolean} 是否为底图层cre
     * @param options - {Object} 创建地图的可选参数
     * @return {this} this
     */
    addLayerWrapper: function (layer, isBaseLayer, options) {
        if (isBaseLayer) {
            this.createMap(options);
        }
        return this.addLayer(layer);
    },

    /**
     * @private
     * @function L.supermap.webmap.prototype.createLayersByJson
     * @description 通过json创建图层
     * @param layersJson - {JSON} 图层的json信息
     */
    createLayersByJson: function (layersJson) {
        if (!L.Util.isArray(layersJson)) {
            return;
        }
        if (layersJson.length === 0) {
            return;
        }
        this.layers = [];
        var layerQueue = [];
        for (var i = 0; i < layersJson.length; i++) {
            var layerJson = layersJson[i];
            layerJson["_originIndex"] = i;
            var layerJsonType = layerJson.layerType = layerJson.layerType || "BASE_LAYER";
            if (layerJsonType !== "BASE_LAYER") {
                //如果图层不是底图，则先加到图层队列里面等待底图完成后再处理
                layerQueue.unshift(layerJson);
                continue;
            } else {
                layerJson.isBaseLayer = true;
                this.createLayer(layerJson.type, layerJson);
            }
        }
        //底图加载完成后开始处理图层队列里的图层
        while (layerQueue.length > 0) {
            var layerInfo = layerQueue.pop();
            var type = layerInfo.type;
            var layerType = layerInfo.layerType = layerInfo.layerType || "BASE_LAYER";
            if (layerType !== "OVERLAY_LAYER") {
                type = layerType;
            }
            this.createLayer(type, layerInfo);
        }
        this.fire('mapLoaded', {map: this._map});
    },

    /**
     * @private
     * @function L.supermap.webmap.prototype.createCRS
     * @description 创建坐标对象
     * @param epsgCode - {mnumber} epsg编码
     * @param type - {string} 坐标类型
     * @param resolutions - {number}分辨率
     * @param origin - {SuperMap.Point} 起始点
     * @param bounds -{SuperMap.Bounds} 指定坐标范围
     */
    createCRS: function (epsgCode, type, resolutions, origin, bounds) {
        if (epsgCode < 0) {
            return new NonEarthCRS({
                bounds: bounds,
                origin: origin,
                resolutions: resolutions
            })
        }

        if (epsgCode === 910112 || epsgCode === 910102) {
            return L.CRS.BaiduCRS;
        }
        if (epsgCode === 910111) {
            epsgCode = 3857
            //todo 火星mercator
        }
        if (epsgCode === 910101) {
            epsgCode = 4326
            //todo 火星
        }
        return L.Proj.CRS("EPSG:" + epsgCode,
            {
                origin: origin,
                resolutions: resolutions,
                bounds: bounds
            })
    },

    /**
     * @private
     * @function L.supermap.webmap.prototype.createMap
     * @description 创建地图
     * @param options - {Object} 创建地图所需参数
     */
    createMap: function (options) {
        var crs = options.crs || L.CRS.EPSG3857;
        var bounds = L.latLngBounds(crs.unproject(options.bounds.min), crs.unproject(options.bounds.max));
        this._map = L.map(this.options.map, {
            center: bounds.getCenter(),
            maxZoom: options.maxZoom || 22,
            minZoom: options.minZoom || 0,
            zoom: options.zoom || 0,
            crs: crs,
            renderer: L.canvas()
        });
        if (crs instanceof NonEarthCRS) {
            this._map.setZoom(options.zoom ? options.zoom + 2 : 2, {maxZoom: options.maxZoom || 22});
        } else {
            this._map.fitBounds(bounds, {maxZoom: options.maxZoom || 22});
        }


    },

    /**
     * @private
     * @function L.supermap.webmap.prototype.getResolutionsFromScales
     * @description 通过比例尺获取分辨率
     * @param scales - {Array<number>} 排序比例尺数组
     * @param dpi - {number}屏幕分辨率
     * @param units - {string} 地图的单位
     * @param datum - {SuperMap.Datum} 大地参照系类
     * @return {Array<number>} 返回给定比例尺所对应的分辨率
     */
    getResolutionsFromScales: function (scales, dpi, units, datum) {
        var resolutions = [];
        for (var i = 0; i < scales.length; i++) {
            resolutions.push(L.Util.GetResolutionFromScaleDpi(scales[i], dpi, units, datum))
        }
        return resolutions;
    },

    /**
     * @private
     * @function L.supermap.webmap.prototype.createLayer
     * @description 创建图层
     * @param type - {string} 图层类型
     * @param layerInfo - {Object} 图层信息
     */
    createLayer: function (type, layerInfo) {
        var prjCoordSys = layerInfo.prjCoordSys,
            epsgCode = prjCoordSys && prjCoordSys.epsgCode || this.mapInfo.epsgCode,
            center = this.mapInfo.center || layerInfo.center,
            level = this.mapInfo.level || layerInfo.level,
            bounds = this.mapInfo.extent || layerInfo.bounds,
            scales = layerInfo.scales,
            isBaseLayer = layerInfo.isBaseLayer,
            opacity = layerInfo.opacity;
        var mapBounds = L.bounds([bounds.leftBottom.x, bounds.leftBottom.y], [bounds.rightTop.x, bounds.rightTop.y]);
        var layerBounds = layerInfo.bounds ? L.bounds([layerInfo.bounds.leftBottom.x, layerInfo.bounds.leftBottom.y], [layerInfo.bounds.rightTop.x, layerInfo.bounds.rightTop.y]) : null;
        var origin = layerBounds ? L.point(layerBounds.min.x, layerBounds.max.y) : L.point(mapBounds.min.x, mapBounds.max.y);
        var resolutions = !scales ? null : this.getResolutionsFromScales(scales, 96, layerInfo.units);
        var crs = this.createCRS(epsgCode, prjCoordSys ? prjCoordSys.type : '', resolutions, origin, layerBounds || mapBounds);
        var mapOptions = {
            bounds: mapBounds,
            center: L.point(center.x, center.y),
            crs: crs,
            zoom: level
        };
        var layer;
        switch (type) {
            case "SUPERMAP_REST" :
                layer = L.supermap.tiledMapLayer(layerInfo.url, {
                    transparent: true,
                    opacity: opacity
                });
                break;
            case "SUPERMAP_REST_VECTOR":
                //ToDO
                break;
            case "TIANDITU_VEC":
            case "TIANDITU_IMG":
            case "TIANDITU_TER":
                mapOptions.crs = epsgCode === 4326 ? L.CRS.TianDiTu_WGS84 : L.CRS.TianDiTu_Mercator;
                mapOptions.minZoom = 1;
                mapOptions.zoom = 1 + mapOptions.zoom;
                layer = this.createTiandituLayer(layerInfo, epsgCode);
                break;
            case "BAIDU":
                mapOptions.crs = L.CRS.BaiduCRS;
                mapOptions.zoom = 3 + mapOptions.zoom;
                mapOptions.minZoom = 3;
                layer = L.supermap.baiduTileLayer();
                break;
            case 'BING':
                //todo
                break;
            case "WMS":
                layer = this.createWmsLayer(layerInfo);
                break;
            case "WMTS":
                mapOptions.resolutions = this.getResolutionsFromScales(scales, 90.71446714322, layerInfo.units);
                var identifier = layerInfo.identifier;
                var layerName = identifier.substring(identifier.indexOf("_") + 1);
                layer = L.supermap.wmtsLayer(layerInfo.url,
                    {
                        layer: layerName,
                        style: "default",
                        tilematrixSet: identifier,
                        format: "image/png"
                    }
                );
                break;
            case "CLOUD":
                mapOptions.crs = L.CRS.EPSG3857;
                mapOptions.zoom = 3 + mapOptions.zoom;
                mapOptions.minZoom = 3;
                layer = L.supermap.cloudTileLayer(layerInfo.url, {opacity: opacity});
                break;
            case "MARKER_LAYER":
                layer = this.createMarkersLayer(layerInfo, crs);
                break;
            case "FEATURE_LAYER":
                if (layerInfo.identifier == "ANIMATORVECTOR") {
                    //todo
                } else if (layerInfo.identifier == "THEME") {
                    layer = this.createThemeLayer(layerInfo, crs);
                } else {
                    layer = this.createVectorLayer(layerInfo, crs);
                }
                break;
            default:
                throw new Error('unSupported Layer Type');
        }
        if (layer && layerInfo.isVisible) {
            this.addLayerWrapper(layer, isBaseLayer, mapOptions);
        }
    },

    /**
     * @private
     * @function L.supermap.webmap.prototype.createTiandituLayer
     * @description 创建天地图图层
     * @param layerInfo - {Object} 图层信息
     * @param epsgCode - {number}epsg编码
     * @return {L.supermap.tiandituTileLayer} 返回天地图图层对象
     */
    createTiandituLayer: function (layerInfo, epsgCode) {
        var proj = epsgCode === 4326 ? "c" : "w";
        var wmtsURL =
            "http://t{s}.tianditu.com/{type}_{proj}/wmts?";
        var type = layerInfo.type.split('_')[1].toLowerCase();
        if (layerInfo.layerType === 'OVERLAY_LAYER') {
            if (type == "vec") {
                type = "cva"
            }
            if (type == "img") {
                type = "cia"
            }
            if (type == "ter") {
                type = "cta"
            }
        }
        wmtsURL = wmtsURL.replace("{type}", type).replace("{proj}", proj);
        var layer = L.supermap.tiandituTileLayer(wmtsURL,
            {
                layer: type,
                tilematrixSet: proj
            }
        );
        return layer;
    },

    /**
     * @private
     * @function L.supermap.webmap.prototype.createMarkersLayer
     * @description 创建图标图层
     * @param layerInfo - {Object} 图层信息
     * @param crs - {Object} 坐标对象
     * @return {L.Layer} 返回marker图层
     */
    createMarkersLayer: function (layerInfo, crs) {
        var that = this;
        var markers = layerInfo.markers || [];
        //style = layerInfo.style,
        //opacity = layerInfo.opacity,
        //marker, point, size, offset, icon, that = this;
        //todo offset
        var coordsToLatLng = function (coords) {
            var ll = crs.unproject(L.point(coords[0], coords[1]));
            return new L.LatLng(ll.lat, ll.lng, coords[2]);
        };

        var layer = L.geoJSON(L.Util.toGeoJSON(markers), {
            pointToLayer: function (geojson, latlng) {
                var m = new L.Marker(latlng);
                m.setStyle = function (style) {
                    if (style) {
                        m.setIcon(style);
                    }
                }
                return m;
            },
            coordsToLatLng: coordsToLatLng, style: function (geoJsonFeature) {
                return that.cartoCSSToLeaflet.getStyleFromiPortalMarker(geoJsonFeature.properties.icon);
            }
        });
        if (this.options.featureLayerPopupEnable) {
            layer.bindPopup(this.options.featureLayerPopup || this.defaultFeatureLayerPopup)
        }
        return layer;
    },
    /**
     * @private
     * @function L.supermap.webmap.prototype.createWmsLayer
     * @description 创建Wms图层
     * @param layerInfo - {Object} 图层信息
     */
    createWmsLayer: function (layerInfo) {
        var url = layerInfo.url,
            opacity = layerInfo.opacity,
            subLayers = layerInfo.subLayers;

        if (!subLayers || subLayers === "undefined" || subLayers === "null") {
            subLayers = "0";
        }
        return L.tileLayer.wms(url, {
            layers: subLayers,
            format: 'image/png',
            transparent: true,
            noWrap: true,
            opacity: opacity
        })
    },
    /**
     * @private
     * @function L.supermap.webmap.prototype.createVectorLayer
     * @description 创建矢量要素图层
     * @param layerInfo - {Object} 图层信息
     * @param crs - {Object} 坐标对象
     * @return {L.Layer} 返回矢量要素图层对象
     */
    createVectorLayer: function (layerInfo, crs) {
        var style = layerInfo.style,
            opacity = layerInfo.opacity,
            me = this;
        //todo readonly = layerInfo.readonly;
        var coordsToLatLng = function (coords) {
            var ll = crs.unproject(L.point(coords[0], coords[1]));
            return new L.LatLng(ll.lat, ll.lng, coords[2]);
        };
        if (!layerInfo.url) {
            var layer = L.geoJSON(L.Util.toGeoJSON(layerInfo.features), {
                pointToLayer: function (geojson, latlng) {
                    var m = new L.Marker(latlng);
                    m.setStyle = function (style) {
                        if (style) {
                            m.setIcon(style);
                        }
                    }
                    return m;
                },
                coordsToLatLng: coordsToLatLng, style: function (geoJsonFeature) {
                    return me.cartoCSSToLeaflet.getStyleFromiPortalStyle(style ? style : {}, geoJsonFeature.geometry.type, geoJsonFeature.properties.style);
                },
                opacity: opacity
            });
            if (this.options.featureLayerPopupEnable) {
                layer.bindPopup(this.options.featureLayerPopup || this.defaultFeatureLayerPopup)
            }
            return layer;
        } else {
            var url = layerInfo.url,
                datasourceName = layerInfo.name,
                datasets = layerInfo.features;
            for (var setNameIndex = 0; setNameIndex < datasets.length; setNameIndex++) {
                var dataset = datasets[setNameIndex];
                if (dataset.visible) {
                    this.getFeaturesBySQL(url, datasourceName, dataset.name, "", DataFormat.GEOJSON, (serviceResult)=> {
                        var layer = L.geoJSON(serviceResult.result, {
                            pointToLayer: function (geojson, latlng) {
                                var m = new L.Marker(latlng);
                                m.setStyle = function (style) {
                                    if (style) {
                                        m.setIcon(style);
                                    }
                                };
                                return m;
                            },
                            coordsToLatLng: coordsToLatLng,
                            style: function (geoJsonFeature) {
                                return this.cartoCSSToLeaflet.getStyleFromiPortalStyle(style ? style : {}, geoJsonFeature.geometry.type, geoJsonFeature.properties.style);
                            },
                            opacity: opacity
                        });
                        if (this.options.featureLayerPopupEnable) {
                            layer.bindPopup(me.options.featureLayerPopup || me.defaultFeatureLayerPopup)
                        }
                        this.addLayer(layer);
                    })
                }
            }
        }
    },
    getFeaturesBySQL: function (url, datasourceName, datasetName, filter, format, callback) {
        filter = filter || "SMID > 0";
        var sqlParam = new SuperMap.GetFeaturesBySQLParameters({
            queryParameter: {
                name: datasetName + "@" + datasourceName,
                attributeFilter: filter
            },
            datasetNames: [datasourceName + ":" + datasetName]
        });
        featureService(url).getFeaturesBySQL(sqlParam, callback, format);
    },
    /**
     * @private
     * @function L.supermap.webmap.prototype.createThemeLayer
     * @description 创建专题图图层
     * @param layerInfo - {Object} 图层信息
     * @param crs - {Object} 坐标对象
     * @return {L.Layer} 返回专题图图层对象
     */
    createThemeLayer: function (layerInfo, crs) {
        var themeSettings = layerInfo.themeSettings && JSON.parse(layerInfo.themeSettings);
        if (layerInfo.themeSettings && themeSettings.labelField) {
            //var labelLayer = this.createLableLayer(layerInfo,themeSettings);
        }
        var layer;
        var type = themeSettings.type;
        layerInfo.themeSettings = themeSettings;
        if (type === "HEAT") {
            layer = this.createHeatLayer(layerInfo, themeSettings);
        } else if (type === "UNIQUE") {
            layer = this.createUniqueLayer(layerInfo, themeSettings);
        } else if (type === "RANGE") {
            layer = this.createRangeLayer(layerInfo, themeSettings);
        } else {
            layer = this.createBaseThemeLayer(layerInfo, themeSettings);
        }
        if (layer) {
            this.addFeature2ThemeLayer(layerInfo, layer);
            layer.on('add', (e)=> {
                this.registerThemeEvent(e.target);
            })
        }

        return layer;
    },
    createBaseThemeLayer: function (layerInfo, themeSettings) {
        let style = layerInfo.style, opacity = layerInfo.opacity, vectorType = themeSettings.vectorType, featureStyle = style.pointStyle;
        if (vectorType === "LINE") {
            featureStyle.fill = false;
        } else {
            featureStyle.fill = true;
        }
        var coordsToLatLng = (coords) => {
            var ll = this._map.options.crs.unproject(L.point(coords[0], coords[1]));
            return new L.LatLng(ll.lat, ll.lng, coords[2]);
        };
        var pointStyle = {};
        pointStyle.radius = featureStyle.pointRadius;
        pointStyle.color = featureStyle.strokeColor;
        pointStyle.opacity = featureStyle.strokeOpacity;
        pointStyle.lineCap = featureStyle.strokeLineCap;
        pointStyle.weight = featureStyle.strokeWidth;
        pointStyle.fillColor = featureStyle.fillColor;
        pointStyle.fillOpacity = featureStyle.fillOpacity;
        var pointToLayer = (geojson, latlng) => {
            return L.circleMarker(latlng, pointStyle);
        };
        if (featureStyle.unicode) {
            pointToLayer = (geojson, latlng)=> {
                return new UnicodeMarker(latlng, featureStyle)
            }
        }
        return L.geoJSON({type: "GeometryCollection", geometries: []}, {
            pointToLayer: pointToLayer,
            coordsToLatLng: coordsToLatLng,
            opacity: opacity
        });
        //this.registerVectorEvent(vector);
    },
    createUniqueLayer: function (layerInfo, themeSettings) {
        var title = layerInfo.title, epsgCode = layerInfo.prjCoordSys.epsgCode;
        var themeField = themeSettings.field, styleGroups = [], settings = themeSettings.settings,
            isVisible = layerInfo.isVisible, opacity = layerInfo.opacity, vectorType = themeSettings.vectorType;
        //组成styleGroup
        for (var i = 0; i < settings.length; i++) {
            var object = {};
            object.value = settings[i].value;
            object.style = settings[i].style;
            styleGroups.push(object);
        }
        var unique = new UniqueThemeLayer(title, {
            opacity: opacity,
            visibility: isVisible
        });
        this.registerThemeEvent(unique);
        unique.style = layerInfo.style.pointStyle;
        if (vectorType === "LINE") {
            unique.style.fill = false;
        }
        unique.style.stroke = true;
        unique.themeField = themeField;
        unique.styleGroups = styleGroups;
        var that = this;
        unique.on('click', function (event) {
            if (event.target && event.target.refDataID) {
                var currenFeature = unique.getFeatureById(event.target.refDataID);
                that.events.triggerEvent("uniquefeatureclicked", currenFeature, unique);
            }
        });
        return unique;
    },
    createRangeLayer: function (layerInfo, themeSettings) {
        var title = layerInfo.title, epsgCode = layerInfo.prjCoordSys.epsgCode;
        var themeField = themeSettings.field, styleGroups = [], settings = themeSettings.settings,
            isVisible = layerInfo.isVisible, opacity = layerInfo.opacity, vectorType = themeSettings.vectorType,
            featureStyle = layerInfo.style.pointStyle;
        if (vectorType === "LINE") {
            featureStyle.fill = false;
        } else {
            featureStyle.fill = true;
        }
        //组成styleGroup
        for (var i = 0; i < settings.length; i++) {
            var object = {};
            object.start = settings[i].start;
            object.end = settings[i].end;
            object.style = settings[i].style;
            styleGroups.push(object);
        }
        var range = new RangeThemeLayer(title, {
            visibility: isVisible
        });
        this.registerThemeEvent(range);
        range.setOpacity(opacity);
        range.style = layerInfo.style.pointStyle;
        range.style.stroke = true;
        range.themeField = themeField;
        range.styleGroups = styleGroups;
        return range;
    },
    createHeatLayer: function (layerInfo, themeSettings) {
        let colors = themeSettings.colors || ['blue', 'cyan', 'lime', 'yellow', 'red'];
        let gradient = {}, featureWeight;
        for (let i = 0, len = colors.length, index = 1; i < len; i++) {
            gradient[index / len] = colors[i];
            index++;
        }
        let radius = themeSettings.settings[0].radius;
        //判断单位
        if (themeSettings.heatUnit === "千米" || themeSettings.heatUnit === "km") {
            radius = themeSettings.heatRadius * 1000
        }
        //权重
        if (themeSettings.settings[0] && themeSettings.settings[0].featureWeight) {
            featureWeight = themeSettings.settings[0].featureWeight;
        }
        return L.heatLayer([], {
            radius: radius / 2,
            minOpacity: layerInfo.opacity,
            gradient: gradient,
            blur: radius / 2,
            featureWeight: featureWeight
        })
    },
    addFeature2ThemeLayer: function (layerInfo, layer) {
        if (layerInfo.layerType !== "FEATURE_LAYER" || layerInfo.identifier !== "THEME") {
            return;
        }
        var me = this;
        var isRestData = !!layerInfo.datasourceName;
        var cartoCSS = layerInfo.cartoCSS;
        if (cartoCSS) {
            var needTransform = this.getCartoCSS2Obj(cartoCSS).needTransform;
            var isAddFile = this.getCartoCSS2Obj(cartoCSS).isAddFile;
        }

        var url = layerInfo.url, subLayers, subLayer, layerName, credential = layerInfo.credential,
            themeSettings = layerInfo.themeSettings, filter = themeSettings.filter;

        if (isAddFile) {
            var position = JSON.parse(layerInfo.datasourceName);
            var sql = this.getSQLFromFilter(filter);
            if (url) {
                this.getFeatureFromFileAdded(layerInfo, function (data) {
                    var sFeaturesArr = [], features, result;
                    if (data.type === 'EXCEL' || data.type === 'CSV') {
                        features = me.parseFeatureFromEXCEL.apply(me, [data.content.rows, data.content.colTitles, false, position]);
                        for (var x = 0, len = features.length; x < len; x++) {
                            result = jsonsql({attr: features[x].attributes}, sql);
                            if (result.length > 0) {
                                sFeaturesArr.push(features[x])
                            }
                        }
                    } else {
                        features = me.parseFeatureFromJson(data.content);
                        for (var i = 0, length = features.length; i < length; i++) {
                            result = jsonsql({attr: features[i].attributes}, sql);
                            if (result.length > 0) {
                                sFeaturesArr.push(features[i]);
                            }
                        }
                    }
                    var newEpsgCode = me.mapInfo && me.mapInfo.epsgCode,
                        oldEpsgCode = layerInfo.prjCoordSys && layerInfo.prjCoordSys.epsgCode;
                    if (needTransform) {
                        me.changeFeatureLayerEpsgCode(oldEpsgCode, newEpsgCode, layer, sFeaturesArr, function (features) {
                            addFeatures(features);
                        });
                    } else {
                        addFeatures(sFeaturesArr);
                    }
                }, function (err) {
                });
            } else {
                var newFeautures = [], features = layerInfo.features;
                for (var i = 0, len = features.length; i < len; i++) {
                    var feature = features[i];
                    var sqlResult = jsonsql({attr: feature.attributes}, sql);
                    if (sqlResult.length > 0) {
                        var lon = feature.geometry.points[0].x,
                            lat = feature.geometry.points[0].y;
                        var point = new SuperMap.Geometry.Point(lon, lat);
                        var vector = new SuperMap.Feature.Vector(point, feature.attributes, feature.style);
                        newFeautures.push(vector);
                    }
                }
                addFeatures(newFeautures);
            }
        } else if (isRestData) {
            var dataSourceName = layerInfo.datasourceName;
            subLayers = layerInfo.subLayers && JSON.parse(layerInfo.subLayers);
            if (subLayers.length && subLayers.length > 0) {
                subLayer = subLayers[0];
            } else {
                subLayer = subLayers;
            }
            layerName = subLayer && subLayer.name;
            this.getFeaturesBySQL(layerInfo.url, dataSourceName, layerName, themeSettings.filter, DataFormat.ISERVER, (getFeaturesEventArgs)=> {
                var features, feature, result = getFeaturesEventArgs.result, addedFeatures = [];
                if (result && result.features) {
                    features = result.features;
                    for (var fi = 0, felen = features.length; fi < felen; fi++) {
                        feature = new ServerFeature.fromJson(features[fi]).toFeature();
                        addedFeatures.push(feature);
                    }
                    var newEpsgCode = me.mapInfo && me.mapInfo.epsgCode,
                        oldEpsgCode = layerInfo.prjCoordSys && layerInfo.prjCoordSys.epsgCode;

                    if (needTransform) {
                        this.changeFeatureLayerEpsgCode(oldEpsgCode, newEpsgCode, layer, addedFeatures, function (features) {
                            addFeatures(features);
                        });
                    } else {
                        addFeatures(features);
                    }
                }
            })
        } else {
            subLayers = layerInfo.subLayers && JSON.parse(layerInfo.subLayers);
            if (subLayers.length && subLayers.length > 0) {
                subLayer = subLayers[0];
            } else {
                subLayer = subLayers;
            }
            layerName = subLayer && subLayer.name;
            var oldEpsgCode = layerInfo.prjCoordSys && layerInfo.prjCoordSys.epsgCode
            this.queryFeaturesBySQL(url, credential, layerName, filter, needTransform ? '' : oldEpsgCode, function (features) {
                var newEpsgCode = me.mapInfo && me.mapInfo.epsgCode;
                if (needTransform) {
                    me.changeFeatureLayerEpsgCode(oldEpsgCode, newEpsgCode, layer, features, function (features) {
                        addFeatures(features);
                    });
                } else {
                    addFeatures(features);
                }
            });
        }
        function addFeatures(features) {
            if (layer.labelLayer) {
                // me.addFeature2LableLayer(layerInfo, features, layer.labelLayer);
            }
            var heatPoints = [];
            if (L.HeatLayer && layer instanceof L.HeatLayer) {
                for (let i = 0, len = features.length; i < len; i++) {
                    let geometry = features[i].geometry;
                    heatPoints[i] = me._map.options.crs.unproject(L.point(geometry.x, geometry.y));
                    if (layer.options.featureWeight) {
                        heatPoints[i] = [heatPoints[i].lat, heatPoints[i].lng, parseFloat(features[i].attributes[layer.options.featureWeight])];
                    }
                }
                layer.setLatLngs(heatPoints);
            } else if (layer instanceof L.GeoJSON) {
                layer.addData(JSON.parse(new SuperMap.Format.GeoJSON().write(features)));
            } else {
                layer.addFeatures(features);
            }

        }
    },
    changeFeatureLayerEpsgCode: function (oldEpsgCode, newEpsgCode, layer, features, success) {
        var me = this, i, len;
        var points = [];
        if (!oldEpsgCode || !newEpsgCode) {
            return;
        }
        if (features && features.length > 0) {
            for (i = 0, len = features.length; i < len; i++) {
                var feature = features[i];
                var geometry = feature.geometry;
                var vertices = geometry.getVertices();
                points = points.concat(vertices);
            }
            oldEpsgCode = 'EPSG:' + oldEpsgCode, newEpsgCode = 'EPSG:' + newEpsgCode;
            me.coordsTransform(oldEpsgCode, newEpsgCode, points, function (layer, features) {
                return function (newCoors) {
                    var start = 0, len = newCoors.length;
                    for (i = start; i < len; i++) {
                        var point = points[i], coor = newCoors[i];
                        point.x = coor.x;
                        point.y = coor.y;
                        point.calculateBounds();
                    }
                    for (i = 0, len = features.length; i < len; i++) {
                        var feature = features[i];
                        var geometry = feature.geometry;
                        if (geometry.components) {
                            me.calculateComponents(geometry.components);
                        }
                        geometry.calculateBounds();
                    }
                    success && success.call(me, features);
                }
            }(layer, features));
        }
        return true;
    },
    calculateComponents: function (components) {
        if (components) {
            if (components.components) {
                this.calculateComponents(components.components);
            } else {
                for (var i = 0, len = components.length; i < len; i++) {
                    var component = components[i];
                    if (component.components) {
                        this.calculateComponents(component.components)
                    }
                    component.calculateBounds();
                }
            }
        }
    },
    coordsTransform: function (fromEpsg, toEpsg, point, success) {
        var newCoord;
        var from = this.SERVER_TYPE_MAP[fromEpsg], to = this.SERVER_TYPE_MAP[toEpsg];
        if (fromEpsg === toEpsg || !from || !to) {
            if (point && point.length !== undefined) {
                newCoord = [];
                for (var i = 0, len = point.length; i < len; i++) {
                    var coor = {x: point[i].x, y: point[i].y};
                    newCoord.push(coor);
                }
            } else {
                newCoord = {x: point.x, y: point.y};
            }
            if (success) {
                success.call(this, newCoord);
            }
        } else {
            var mercator = this.SERVER_TYPE_MAP['EPSG:3857'], wgs84 = this.SERVER_TYPE_MAP['EPSG:4326'];
            if ((from === mercator || from === wgs84) && (to === mercator || to === wgs84)) {
                this.projTransform(fromEpsg, toEpsg, point, success);
            } else {
                var convertType = from + '_' + to;
                this.postTransform(convertType, point, success);
            }
        }
    },
    projTransform: function (fromEpsg, toEpsg, point, success) {
        var newCoor, me = this;
        if (!proj4) {
            return;
        }
        if (point && point.length !== undefined) {
            newCoor = [];
            for (var i = 0, len = point.length; i < len; i++) {
                var coor = proj4(fromEpsg, toEpsg, [point[i].x, point[i].y]);
                newCoor.push({x: coor[0], y: coor[1]});
            }
        } else {
            newCoor = proj4(fromEpsg, toEpsg, [point.x, point.y]);
            newCoor = {x: newCoor[0], y: newCoor[1]};
        }
        if (success) {
            me.fire('coordconvertsuccess', {newCoor: newCoor});
            success.call(me, newCoor);
        }
    },
    postTransform: function (convertType, point, success) {
        var me = this, epsgArray = [];
        if (!convertType) {
            return success.call(me, null);
        }
        if (point && point.length !== undefined) {
            for (var i = 0, len = point.length; i < len; i++) {
                epsgArray.push({x: point[i].x, y: point[i].y});
            }
        } else {
            epsgArray = [{x: point.x, y: point.y}];
        }
        if (epsgArray.length === 0) {
            return success.call(me, null);
        }
        var postData = {
            "convertType": convertType,
            "points": epsgArray
        };
        var url = this.url + "coordconvert.json";
        postData = JSON.stringify(postData);
        var options = {
            url: url,
            isInTheSameDomain: true,
            data: postData,
            method: "POST",
            success: function (success) {
                return function (res) {
                    if (success) {
                        var newCoors = JSON.parse(res.responseText);
                        if (!point && point.length !== undefined) {
                            newCoors = newCoors[0];
                        }
                        me.fire('coordconvertsuccess', {newCoors: newCoors});
                        success.call(me, newCoors);
                    }
                }
            }(success),
            failure: function (err) {
                if (!me.actived) {
                    return;
                }
                me.fire('coordconvertfailed', {err: err});
            },
            scope: this
        };
        if (!SuperMap.Util.isInTheSameDomain(url) && this.proxy) {
            options.proxy = this.proxy;
        }
        SuperMap.Util.committer(options);
    },
    getSQLFromFilter: function (filter) {

        if (filter === '') {
            return ' * where (1>=1)'
        } else {
            filter = filter.replace(/=/g, '==').replace(/and|AND/g, '&&').replace(/or|OR/g, '||').replace(/>==/g, '>=').replace(/<==/g, '<=');
            return '*  where (' + filter + ')';
        }
    },
    getAttributesObjFromTable: function (cols, colTitles) {
        if (cols.length < 0 || colTitles.length < 0) {
            return;
        }
        var attrArr = [];
        for (var i = 0; i < cols.length; i++) {
            var obj = {};
            for (var j = 0; j < colTitles.length; j++) {
                obj[colTitles[j]] = cols[i][j]
            }
            attrArr.push(obj);
        }
        return attrArr;
    },
    parseFeatureFromEXCEL: function (rows, colTitles, isGraphic, position) {
        var attrArr = this.getAttributesObjFromTable(rows, colTitles);
        var features = [];
        for (var i = 0, len = attrArr.length; i < len; i++) {
            var geometry = new SuperMap.Geometry.Point(attrArr[i][position["lon"]], attrArr[i][position["lat"]]);
            var pointGraphic;
            if (isGraphic) {
                pointGraphic = new SuperMap.Graphic(geometry, attrArr[i], null);
            } else {
                pointGraphic = new SuperMap.Feature.Vector(geometry, attrArr[i], null);
            }
            features.push(pointGraphic);
        }
        return features;


    },
    parseFeatureFromJson: function (feature) {
        var format = new SuperMap.Format.GeoJSON();
        var features = format.read(feature);
        //兼容insights数据格式
        if (features == null) {
            var content = JSON.parse(feature.replace(/'/, '"'));
            if (content.isAnalyseResult) {
                content = content.data.recordsets[0].features;
            }
            format = new SuperMap.Format.GeoJSON();
            features = format.read(content);
        }
        for (var i = 0, len = features.length; i < len; i++) {
            features[i].attributes = features[i].attributes.properties || features[i].attributes;
        }
        return features;

    },
    getFeatureFromFileAdded: function (layerInfo, success, failed, isGraphic) {
        var url = isGraphic ? layerInfo.url + '?currentPage=1&&pageSize=9999999' : layerInfo.url;
        Request.get(url).then(response=>response.json()).then(data=> {
            success && success(data);
        }).catch(err => failed && failed(err));
    },
    getCartoCSS2Obj: function (cartoCSS) {
        var isAddFile, needTransform = false;
        if (cartoCSS.indexOf('}') > -1) {
            cartoCSS = JSON.parse(cartoCSS);
            needTransform = cartoCSS.needTransform;
            isAddFile = cartoCSS.isAddFile;
        } else {
            if (cartoCSS === 'needTransform') {
                needTransform = true;
                //layerInfo.needTransform = true;
                isAddFile = false;
            } else {
                isAddFile = cartoCSS === 'true';
            }
        }
        return {
            isAddFile: isAddFile,
            needTransform: needTransform
        }


    },
    registerThemeEvent: function (themeLayer) {
        themeLayer.on('click', evt=> {
            if (!themeLayer.map) {
                return;
            }
            if (this.selectedFeature) {
                this.fire('featureUnSelected', {feature: this.selectedFeature});
                this.selectedFeature = null;
            }
            let feature;
            if (evt.target && evt.target.refDataID) {
                feature = themeLayer.getFeatureById(evt.target.refDataID);
            }
            if (feature) {
                this.selectedFeature = feature;
                this.fire('featureSelected', {feature: feature});
            }
        });
        themeLayer.on('mousemove', evt=> {
            if (!themeLayer.map) {
                return;
            }
            if (evt.target && evt.target.refDataID) {
                let feature;
                if (evt.target && evt.target.refDataID) {
                    feature = themeLayer.getFeatureById(evt.target.refDataID);
                }
                if (feature) {
                    this.fire('featureMousemove', {feature: feature});
                }

            }
        });
    },
    SERVER_TYPE_MAP: {
        "EPSG:4326": "WGS84",
        "EPSG:3857": "MERCATOR",
        "EPSG:900913": "MERCATOR",
        "EPSG:102113": "MERCATOR",
        "EPSG:910101": "GCJ02",
        "EPSG:910111": "GCJ02MERCATOR",
        "EPSG:910102": "BD",
        "EPSG:910112": "BDMERCATOR"
    }
});
export var webMap = function (id, options) {
    return new WebMap(id, options);
};
L.supermap.webmap = webMap