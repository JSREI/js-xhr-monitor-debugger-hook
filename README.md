# XHR Hook

# 还未开发完，只是public喽一眼，请勿期待随时烂尾。。。

- 设置请求头断点 
    - 
- before response断点
    在响应后直接定位到xhr请求的响应体，这样就不需要吭哧吭哧
- 请求头断点（不推荐）
    - 与chrome提供的xhr断点功能重复，因此不推荐使用此功能
``
- 反xhr拦截器统一设置请求加密参数 
有些网站会拦截每个xhr请求，统一为请求加上加密参数，
  因为你不知道
  
- 阿斯顿阿斯顿
  

对于比较新的fetch api也归入xhr类别（反正Chrome就是这么分的），
不再单独划分出一个脚本。





    
本脚本的定位就是帮助爬虫开发人员提高效率节省头发。



本人在构思此脚本时通读了以下开源项目的源码，感谢大佬们愿意开源：
- [https://github.com/wendux/Ajax-hook/blob/master/src/main.js](https://github.com/wendux/Ajax-hook/blob/master/src/xhr-hook.js)


