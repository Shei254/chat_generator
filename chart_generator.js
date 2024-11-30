import fs from 'fs';
import stream from 'stream';
import http from 'http';
import { JSDOM } from 'jsdom';
import * as d3 from "d3";
import { spawn } from 'child_process';

const createSvgImage = (data) => {
    const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8" />
        </head>
        <body>
            <div id="my_dataviz"></div>
        </body>
        </html>
    `);

    const document = dom.window.document;

    // Dimensions and margins
    const width = 450;
    const height = 450;
    const margin = 40;

    // Radius for the pie chart
    const radius = Math.min(width, height) / 2 - margin;

    // Create SVG element
    const svg = d3.select(document.body)
        .select("#my_dataviz")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${width / 2}, ${height / 2})`);

    // Dummy data
    

    // Color scale
    const color = d3.scaleOrdinal()
        .domain(Object.keys(data))
        .range(["#98abc5", "#8a89a6", "#7b6888", "#6b486b", "#a05d56"]);

    // Generate pie chart data
    const pie = d3.pie().value(d => d[1]);
    const dataReady = pie(Object.entries(data));

    // Build pie chart
    svg.selectAll("path")
        .data(dataReady)
        .enter()
        .append("path")
        .attr("d", d3.arc().innerRadius(0).outerRadius(radius))
        .attr("fill", d => color(d.data[0]))
        .attr("stroke", "black")
        .style("stroke-width", "2px")
        .style("opacity", 0.7);


    // Get the <svg> element
    const svgElement = document.getElementsByTagName("svg")[0];

    return svgElement.outerHTML;
}

const server = http.createServer(function (request, response) {
    const defaultData = { a: 9, b: 20, c: 30, d: 8, e: 12 };
    const values = defaultData;
    const cacheKey = Object.values(values).sort().join(",")

    fs.exists(cacheKey, function (exists) {
        response.writeHead(200, {
            "Content-Type": "image/png"
        });

        if (exists) {
            console.debug("sending data from cache");
            const readStream = fs.createReadStream(cacheKey);
            readStream.on("readable", function (err) {
                let chunk;
                while (chunk = this.read()) {
                    response.write(chunk);
                }
            });

            readStream.on("end", function () {
                response.end();
            })
            return;
        }

        console.debug("sending generated data");
        const svg = createSvgImage(defaultData);
        const svgToPng = spawn("magick", ["svg:-", "png:-"]);

        svgToPng.on("error", function (data) {
            console.error("spawn error: ", data.toString());
            response.statusCode = 500;
            response.end("Server Error");
        });

        svgToPng.stdin.write(svg);
        svgToPng.stdin.end();

        svgToPng.stdout.on("error", function (err) {
            console.error("Error converting svg to png: ", err);
            response.statusCode = 500;
            response.end("Server Error");
        });

        svgToPng.stderr.on("data", function (data) {
            console.error("stderr: ", data.toString());
            response.statusCode = 500;
            response.end("Server Error");
        });

        const fileWriter = fs.createWriteStream(cacheKey, {
            flags: "w"
        });

        response.writeHead(200, {
            "Content-Type": "image/png"
        });

        const streamer = new stream.Transform();
        streamer._transform = function (data, enc, cb) {
            fileWriter.write(data);
            this.push(data);
            cb();
        };

        svgToPng.stdout.pipe(streamer).pipe(response);
    })
}).listen(8080);