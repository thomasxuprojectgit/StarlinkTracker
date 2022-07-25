import React, { Component } from "react";
import axios from "axios";
import { Spin } from "antd";
import { feature } from "topojson-client";
import { geoKavrayskiy7 } from "d3-geo-projection";
import { geoGraticule, geoPath } from "d3-geo";
import { select as d3Select } from "d3-selection";
import { schemeCategory10 } from "d3-scale-chromatic";
import * as d3Scale from "d3-scale";
import { timeFormat as d3TimeFormat } from "d3-time-format";

import {
  BASE_URL,
  WORLD_MAP_URL,
  SATELLITE_POSITION_URL,
  SAT_API_KEY
} from "../constants";

const width = 960;
const height = 600;

class WorldMap extends Component {
  constructor() {
    super();
    this.state = {
      isLoading: false,
      isDrawing: false
    };
    this.map = null;
    this.color = d3Scale.scaleOrdinal(schemeCategory10);
    this.refMap = React.createRef();
    this.refTrack = React.createRef();
  }

  // 第一次函数执行完执行
  componentDidMount() {
    // get world map json file
    axios
      .get(WORLD_MAP_URL)
      .then(res => {
        // get raw data from response
        const { data } = res;
        // convert data to info that d3 can understand
        const land = feature(data, data.objects.countries).features;
        // draw map based on land
        this.generateMap(land);
      })
      .catch(e => {
        console.log("err in fetch map data ", e.message);
      });
  }

  // 第2-n次函数执行完执行
  //                 上次的props  上次的state
  componentDidUpdate(prevProps, prevState, snapshot) {
    // 并不能比较array里的东西
    if (prevProps.satData !== this.props.satData) {
      const {
        latitude,
        longitude,
        elevation,
        altitude,
        duration
      } = this.props.observerData;
      const endTime = duration * 60;

      this.setState({
        isLoading: true
      });

      // call 多次api拿到多个Promise
      const urls = this.props.satData.map(sat => {
        const { satid } = sat;
        const url = `${BASE_URL}/api/${SATELLITE_POSITION_URL}/${satid}/${latitude}/${longitude}/${elevation}/${endTime}/&apiKey=${SAT_API_KEY}`;

        return axios.get(url);
      });

      // Promise 浏览器自带
      // 多个Promise 都成功返回的话就处理
      Promise.all(urls)
        .then(res => {
          const arr = res.map(sat => sat.data);
          this.setState({
            isLoading: false,
            isDrawing: true
          });

          // 如果前面已经画完了，那就画现在这个
          if (!prevState.isDrawing) {
            this.track(arr);
          } else {
            const oHint = document.getElementsByClassName("hint")[0];
            oHint.innerHTML =
              "Please wait for these satellite animation to finish before selection new ones!";
          }
        })
        .catch(e => {
          console.log("err in fetch satellite position -> ", e.message);
        });
    }
  }

  // 显示点移动method
  track = data => {
    // 查n2y0传来的数据是否有positions
    if (!data[0].hasOwnProperty("positions")) {
      throw new Error("no position data");
      return;
    }

    // 每个卫星有多少个点
    const len = data[0].positions.length;
    const { duration } = this.props.observerData;
    // 用来画时间
    const { context2 } = this.map;
    // code 运行到这里的时间， 时间1
    let now = new Date();

    // 计数器 画到第几个点了
    let i = 0;

    // 每隔1000毫秒，执行方法
    let timer = setInterval(() => {
      // code 运行到这里的时间， 时间2
      let ct = new Date();
      
      // 时间1和2的间隔
      let timePassed = i === 0 ? 0 : ct - now;
      
      let time = new Date(now.getTime() + 60 * timePassed);
      
      // 擦上个点（方式把整个布擦掉）
      context2.clearRect(0, 0, width, height);

      context2.font = "bold 14px sans-serif";
      context2.fillStyle = "#333";
      context2.textAlign = "center";
      context2.fillText(d3TimeFormat(time), width / 2, 10);
      
      // 如果计数器>= 拿到的点数
      if (i >= len) {
        // 停下interval
        clearInterval(timer);
        // 状态改为不在draw
        this.setState({ isDrawing: false });
        // 在画完前又点了一遍，显示警告
        const oHint = document.getElementsByClassName("hint")[0];
        oHint.innerHTML = "";
        return;
      }

      // 画这个点
      data.forEach(sat => {
        const { info, positions } = sat;
        this.drawSat(info, positions[i]);
      });

      // 计数器增加，每隔60个点画一个点
      i += 60;
    }, 1000);
  };

  // 画点的method
  // sat is satellite basic info
  // pos is 经纬度信息
  drawSat = (sat, pos) => {
    const { satlongitude, satlatitude } = pos;

    // 0 null '' undefined
    // 不够严谨，因为经纬度经过0的时候，也应该画点
    if (!satlongitude || !satlatitude) return;


    const { satname } = sat;
    // use regular expression to format match detection 
    const nameWithNumber = satname.match(/\d+/g).join("");

    //   投影方式        画点的笔
    const { projection, context2 } = this.map;
    //   经纬度转换成地图里的xy
    const xy = projection([satlongitude, satlatitude]);

    // 填充色
    context2.fillStyle = this.color(nameWithNumber);
    context2.beginPath();
    // 画弧线形成一个圆点
    context2.arc(xy[0], xy[1], 4, 0, 2 * Math.PI);
    // 填成实心原
    context2.fill();

    // 设置字体
    context2.font = "bold 11px sans-serif";
    context2.textAlign = "center";
    context2.fillText(nameWithNumber, xy[0], xy[1] + 14);
  };

  render() {
    const { isLoading } = this.state;
    return (
      <div className="map-box">
        {/* 如果在载入就转圈圈 */}
        {isLoading ? (
          <div className="spinner">
            <Spin tip="Loading..." size="large" />
          </div>
        ) : null}
        {/* 两张画布，第一张画地图，第二章画点 */}
        <canvas className="map" ref={this.refMap} />
        <canvas className="track" ref={this.refTrack} />
        <div className="hint" />
      </div>
    );
  }

  generateMap = land => {
    // 铺平地图, use geoKavrayskiy7 style
    const projection = geoKavrayskiy7()
      .scale(170)
      .translate([width / 2, height / 2])
      .precision(0.1);

    // 画经纬度线
    const graticule = geoGraticule();

    // d3 -> reference -> canvas
    const canvas = d3Select(this.refMap.current)
      .attr("width", width)
      .attr("height", height);

    const canvas2 = d3Select(this.refTrack.current)
      .attr("width", width)
      .attr("height", height);

    //  context相当于canvas 的笔
    const context = canvas.node().getContext("2d"); // 画地图的笔
    const context2 = canvas2.node().getContext("2d"); // 画点的笔

    // combine all the tools above to get path, 用作路径规划
    let path = geoPath()
      .projection(projection)
      .context(context);

    // land里的每个ele是每个国家的地理信息  
    land.forEach(ele => {
      // 每个国家颜色
      context.fillStyle = "#B3DDEF";
      // 线颜色
      context.strokeStyle = "#000";
      // 透明度
      context.globalAlpha = 0.7;
      context.beginPath();
      path(ele);
      context.fill();
      context.stroke();
      // 以上画出了国家

      context.strokeStyle = "rgba(220, 220, 220, 0.1)";
      context.beginPath();
      path(graticule());
      context.lineWidth = 0.1;
      context.stroke();
      // 以上画出了经纬度网格线

      context.beginPath();
      context.lineWidth = 0.5;
      path(graticule.outline());
      context.stroke();
      // 以上画出了最外面一圈网格outline
    });

    this.map = {
      projection: projection,
      graticule: graticule,
      context: context,
      context2: context2
    };
  };
}

export default WorldMap;

