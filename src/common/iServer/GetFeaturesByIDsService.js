﻿import {SuperMap} from '../SuperMap';
import {GetFeaturesServiceBase} from './GetFeaturesServiceBase';
import {GetFeaturesByIDsParameters} from './GetFeaturesByIDsParameters';

/**
 * @class SuperMap.GetFeaturesByIDsService
 * @classdesc 数据集ID查询服务类。在数据集集合中查找指定 ID 号对应的空间地物要素。
 * @param url - {string} 数据查询结果资源地址。请求数据服务中数据集查询服务。
 *              URL 应为：http://{服务器地址}:{服务端口号}/iserver/services/{数据服务名}/rest/data/；</br>
 *              例如："http://localhost:8090/iserver/services/data-jingjin/rest/data/"
 * @param options - {Object} 可選参数。如:</br>
 *        eventListeners - {Object} 事件监听器对象。有processCompleted属性可传入处理完成后的回调函数。processFailed属性传入处理失败后的回调函数。<br>
 *        serverType - {SuperMap.ServerType} 服务器类型，iServer|iPortal|Online。<br>
 *        format -{SuperMap.DataFormat} 查询结果返回格式，目前支持iServerJSON 和GeoJSON两种格式。参数格式为"ISERVER","GEOJSON"。
 * @extends SuperMap.GetFeaturesServiceBase
 * @example
 * var myGetFeaturesByIDsService = new SuperMap.GetFeaturesByIDsService(url, {
 *     eventListeners: {
 *         "processCompleted": getFeatureCompleted,
 *         "processFailed": getFeatureError
 *            }
 *     });
 * function getFeatureCompleted(object){//todo};
 * function getFeatureError(object){//todo}
 */
export class GetFeaturesByIDsService extends GetFeaturesServiceBase {


    constructor(url, options) {
        super(url, options);

        this.CLASS_NAME = "SuperMap.GetFeaturesByIDsService";
    }

    /**
     * @function SuperMap.GetFeaturesByIDsService.prototype.destroy
     * @override
     */
    destroy() {
        super.destroy();
    }

    /**
     * @function SuperMap.GetFeaturesByIDsService.prototype.getJsonParameters
     * @description 将查询参数转化为 JSON 字符串。
     * 在本类中重写此方法，可以实现不同种类的查询（ID, SQL, Buffer, Geometry等）。
     * @param  params - {SuperMap.GetFeaturesByIDsParameters}
     * @return {string} 转化后的 JSON 字符串。
     */
    getJsonParameters(params) {
        return GetFeaturesByIDsParameters.toJsonParameters(params);
    }

}

SuperMap.GetFeaturesByIDsService = GetFeaturesByIDsService;