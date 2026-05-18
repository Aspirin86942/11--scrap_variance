"use strict";(()=>{var SHEET_NAMES={oa:"\u67E5\u8BE2OA-\u5B58\u8D27\u62A5\u5E9F\u7533\u8BF7\u5355",erp:"\u67E5\u8BE2ERP-\u62A5\u5E9F\u660E\u7EC6\u8868",panel:"\u67E5\u8BE2\u9762\u677F",
precheckResult:"\u9884\u9A8C\u8BC1\u7ED3\u679C",performanceDiagnostics:"\u6027\u80FD\u8BCA\u65AD\u7ED3\u679C"};var OA_REQUIRED_HEADERS=["\u8868\u5355\u7F16\u53F7",
"\u7533\u8BF7\u65E5\u671F","\u516C\u53F8\u7B80\u79F0","\u4E00\u7EA7\u90E8\u95E8","\u4E8C\u7EA7\u90E8\u95E8","\u7269\u6599\u4EE3\u7801","\u7269\u6599\u540D\u79F0",
"\u6570\u91CF","\u5B9E\u9645\u9884\u7B97\u91D1\u989Dmx"];var ERP_REQUIRED_HEADERS=["\u5355\u636E\u7F16\u53F7","\u65E5\u671F","\u6E90\u5355\u5355\u53F7","\u533A\u5206\u516C\u53F8\u7B80\u79F0",
"\u4E00\u7EA7\u90E8\u95E8","\u4E8C\u7EA7\u90E8\u95E8","\u7269\u6599\u7F16\u7801","\u7269\u6599\u540D\u79F0","\u5B9E\u53D1\u6570\u91CF","\u603B\u6210\u672C"];var SUMMARY_HEADERS=[
"\u516C\u53F8\u7B80\u79F0","\u4E00\u7EA7\u90E8\u95E8","\u4E8C\u7EA7\u90E8\u95E8","OA\u6570\u91CF\u5408\u8BA1","ERP\u5B9E\u53D1\u6570\u91CF\u5408\u8BA1","\u6570\u91CF\u5DEE\u989D",
"OA\u5B9E\u9645\u9884\u7B97\u91D1\u989Dmx\u5408\u8BA1","ERP\u603B\u6210\u672C\u5408\u8BA1","\u91D1\u989D\u5DEE\u989D","\u5DEE\u5F02\u7C7B\u578B\u6458\u8981"];var DETAIL_HEADERS=[
"\u5DEE\u5F02\u7C7B\u578B","OA\u8868\u5355\u7F16\u53F7","OA\u7533\u8BF7\u65E5\u671F","ERP\u51FA\u5E93\u5355\u53F7","ERP\u65E5\u671F","\u7269\u6599\u7F16\u7801",
"\u7269\u6599\u540D\u79F0","\u516C\u53F8\u7B80\u79F0","\u4E00\u7EA7\u90E8\u95E8","\u4E8C\u7EA7\u90E8\u95E8","OA\u6570\u91CF\u5408\u8BA1","ERP\u5B9E\u53D1\u6570\u91CF\u5408\u8BA1",
"\u6570\u91CF\u5DEE\u989D","OA\u5B9E\u9645\u9884\u7B97\u91D1\u989Dmx\u5408\u8BA1","ERP\u603B\u6210\u672C\u5408\u8BA1","\u91D1\u989D\u5DEE\u989D","\u5907\u6CE8"];var DIAGNOSTICS_HEADERS=["\u7C7B\u522B","\u9636\u6BB5","\u8F93\u5165\u884C\u6570","\u8F93\u51FA\u884C\u6570","\u8017\u65F6ms","\u5185\u5B58MB","\u8BF4\u660E"];var NOT_APPLICABLE="\
\u4E0D\u9002\u7528";var DIFFERENCE_TYPE_PRIORITY=["OA\u6709\u7533\u8BF7\uFF0CERP\u65E0\u51FA\u5E93","ERP\u51FA\u5E93\u5BF9\u5E94OA\u672A\u5728\u5F53\u524DOA\u6570\u636E\u4E2D\u627E\u5230",
"OA\u548CERP\u90FD\u6709\uFF0C\u4F46\u7269\u6599\u660E\u7EC6\u4E0D\u4E00\u81F4","OA\u548CERP\u90FD\u6709\uFF0C\u4F46\u6570\u91CF\u4E0D\u540C","OA\u548CERP\u90FD\u6709\uFF0C\u6570\u91CF\u4E00\u81F4"];
var MAX_HEADER_SCAN_ROWS=20;var MIN_OA_HEADER_MATCH_COUNT=5;var MIN_ERP_HEADER_MATCH_COUNT=5;var MAX_OUTPUT_CLEAR_ROW=2e5;var MAX_PRECHECK_CLEAR_ROW=2e5;var MAX_DIAGNOSTICS_CLEAR_ROW=2e5;
var WRITE_CHUNK_ROWS=1e3;function normalizeText(value){if(value===null||value===void 0){return""}return String(value).trim()}function appendUniqueJoinedText(currentText,nextText,delimiter="\
\u3001"){const current=normalizeText(currentText);const next=normalizeText(nextText);if(!next){return current}if(!current){return next}if(current===next||current.
startsWith(`${next}${delimiter}`)||current.endsWith(`${delimiter}${next}`)||current.includes(`${delimiter}${next}${delimiter}`)){return current}return`${current}${delimiter}${next}`}
function isBlankValue(value){return value===null||value===void 0||normalizeText(value)===""}function pad2(value){return value<10?`0${value}`:String(value)}function formatDateKey(year,month,day){return`${year}-${pad2(month)}-${pad2(day)}`}function buildValidatedDateKey(year,month,day,rawValue){
const date=new Date(Date.UTC(year,month-1,day));if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day){throw new Error(`\u65E5\u671F\u683C\u5F0F\u4E0D\u6B63\u786E\
\uFF1A${String(rawValue)}`)}return formatDateKey(year,month,day)}function normalizeDateKey(value){if(value===null||value===void 0){return""}if(Object.prototype.
toString.call(value)==="[object Date]"){const date=value;if(Number.isNaN(date.getTime())){throw new Error(`\u65E5\u671F\u683C\u5F0F\u4E0D\u6B63\u786E\uFF1A${String(
value)}`)}return formatDateKey(date.getFullYear(),date.getMonth()+1,date.getDate())}if(typeof value==="number"){if(!Number.isFinite(value)){throw new Error(`\u65E5\u671F\u683C\
\u5F0F\u4E0D\u6B63\u786E\uFF1A${String(value)}`)}const excelDate=new Date((value-25569)*86400*1e3);if(Number.isNaN(excelDate.getTime())){throw new Error(`\u65E5\u671F\u683C\u5F0F\u4E0D\u6B63\
\u786E\uFF1A${String(value)}`)}return formatDateKey(excelDate.getUTCFullYear(),excelDate.getUTCMonth()+1,excelDate.getUTCDate())}const text=normalizeText(value);
if(text===""){return""}const match=text.match(/^(\d{4})([\/.-])(\d{1,2})\2(\d{1,2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);if(!match){throw new Error(`\u65E5\u671F\u683C\u5F0F\u4E0D\u6B63\u786E\uFF1A${String(
value)}`)}return buildValidatedDateKey(Number(match[1]),Number(match[3]),Number(match[4]),value)}var MAX_DIGITS=1e9;var defaults={precision:20,rounding:4,toExpNeg:-7,toExpPos:21,LN10:"2.30258509299404568401799145468436420760110148862877297603332790096757260\
9677352480235997205089598298341967784042286"};var Decimal;var external=true;var decimalError="[DecimalError] ";var invalidArgument=decimalError+"Invalid argumen\
t: ";var exponentOutOfRange=decimalError+"Exponent out of range: ";var mathfloor=Math.floor;var mathpow=Math.pow;var isDecimal=/^(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;
var ONE;var BASE=1e7;var LOG_BASE=7;var MAX_SAFE_INTEGER=9007199254740991;var MAX_E=mathfloor(MAX_SAFE_INTEGER/LOG_BASE);var P={};P.absoluteValue=P.abs=function(){
var x=new this.constructor(this);if(x.s)x.s=1;return x};P.comparedTo=P.cmp=function(y){var i,j,xdL,ydL,x=this;y=new x.constructor(y);if(x.s!==y.s)return x.s||-y.
s;if(x.e!==y.e)return x.e>y.e^x.s<0?1:-1;xdL=x.d.length;ydL=y.d.length;for(i=0,j=xdL<ydL?xdL:ydL;i<j;++i){if(x.d[i]!==y.d[i])return x.d[i]>y.d[i]^x.s<0?1:-1}return xdL===
ydL?0:xdL>ydL^x.s<0?1:-1};P.decimalPlaces=P.dp=function(){var x=this,w=x.d.length-1,dp=(w-x.e)*LOG_BASE;w=x.d[w];if(w)for(;w%10==0;w/=10)dp--;return dp<0?0:dp};
P.dividedBy=P.div=function(y){return divide(this,new this.constructor(y))};P.dividedToIntegerBy=P.idiv=function(y){var x=this,Ctor=x.constructor;return round(divide(
x,new Ctor(y),0,1),Ctor.precision)};P.equals=P.eq=function(y){return!this.cmp(y)};P.exponent=function(){return getBase10Exponent(this)};P.greaterThan=P.gt=function(y){
return this.cmp(y)>0};P.greaterThanOrEqualTo=P.gte=function(y){return this.cmp(y)>=0};P.isInteger=P.isint=function(){return this.e>this.d.length-2};P.isNegative=
P.isneg=function(){return this.s<0};P.isPositive=P.ispos=function(){return this.s>0};P.isZero=function(){return this.s===0};P.lessThan=P.lt=function(y){return this.
cmp(y)<0};P.lessThanOrEqualTo=P.lte=function(y){return this.cmp(y)<1};P.logarithm=P.log=function(base){var r,x=this,Ctor=x.constructor,pr=Ctor.precision,wpr=pr+
5;if(base===void 0){base=new Ctor(10)}else{base=new Ctor(base);if(base.s<1||base.eq(ONE))throw Error(decimalError+"NaN")}if(x.s<1)throw Error(decimalError+(x.s?
"NaN":"-Infinity"));if(x.eq(ONE))return new Ctor(0);external=false;r=divide(ln(x,wpr),ln(base,wpr),wpr);external=true;return round(r,pr)};P.minus=P.sub=function(y){
var x=this;y=new x.constructor(y);return x.s==y.s?subtract(x,y):add(x,(y.s=-y.s,y))};P.modulo=P.mod=function(y){var q,x=this,Ctor=x.constructor,pr=Ctor.precision;
y=new Ctor(y);if(!y.s)throw Error(decimalError+"NaN");if(!x.s)return round(new Ctor(x),pr);external=false;q=divide(x,y,0,1).times(y);external=true;return x.minus(
q)};P.naturalExponential=P.exp=function(){return exp(this)};P.naturalLogarithm=P.ln=function(){return ln(this)};P.negated=P.neg=function(){var x=new this.constructor(
this);x.s=-x.s||0;return x};P.plus=P.add=function(y){var x=this;y=new x.constructor(y);return x.s==y.s?add(x,y):subtract(x,(y.s=-y.s,y))};P.precision=P.sd=function(z){
var e,sd,w,x=this;if(z!==void 0&&z!==!!z&&z!==1&&z!==0)throw Error(invalidArgument+z);e=getBase10Exponent(x)+1;w=x.d.length-1;sd=w*LOG_BASE+1;w=x.d[w];if(w){for(;w%
10==0;w/=10)sd--;for(w=x.d[0];w>=10;w/=10)sd++}return z&&e>sd?e:sd};P.squareRoot=P.sqrt=function(){var e,n,pr,r,s,t,wpr,x=this,Ctor=x.constructor;if(x.s<1){if(!x.
s)return new Ctor(0);throw Error(decimalError+"NaN")}e=getBase10Exponent(x);external=false;s=Math.sqrt(+x);if(s==0||s==1/0){n=digitsToString(x.d);if((n.length+e)%
2==0)n+="0";s=Math.sqrt(n);e=mathfloor((e+1)/2)-(e<0||e%2);if(s==1/0){n="5e"+e}else{n=s.toExponential();n=n.slice(0,n.indexOf("e")+1)+e}r=new Ctor(n)}else{r=new Ctor(
s.toString())}pr=Ctor.precision;s=wpr=pr+3;for(;;){t=r;r=t.plus(divide(x,t,wpr+2)).times(.5);if(digitsToString(t.d).slice(0,wpr)===(n=digitsToString(r.d)).slice(
0,wpr)){n=n.slice(wpr-3,wpr+1);if(s==wpr&&n=="4999"){round(t,pr+1,0);if(t.times(t).eq(x)){r=t;break}}else if(n!="9999"){break}wpr+=4}}external=true;return round(
r,pr)};P.times=P.mul=function(y){var carry,e,i,k,r,rL,t,xdL,ydL,x=this,Ctor=x.constructor,xd=x.d,yd=(y=new Ctor(y)).d;if(!x.s||!y.s)return new Ctor(0);y.s*=x.s;
e=x.e+y.e;xdL=xd.length;ydL=yd.length;if(xdL<ydL){r=xd;xd=yd;yd=r;rL=xdL;xdL=ydL;ydL=rL}r=[];rL=xdL+ydL;for(i=rL;i--;)r.push(0);for(i=ydL;--i>=0;){carry=0;for(k=
xdL+i;k>i;){t=r[k]+yd[i]*xd[k-i-1]+carry;r[k--]=t%BASE|0;carry=t/BASE|0}r[k]=(r[k]+carry)%BASE|0}for(;!r[--rL];)r.pop();if(carry)++e;else r.shift();y.d=r;y.e=e;
return external?round(y,Ctor.precision):y};P.toDecimalPlaces=P.todp=function(dp,rm){var x=this,Ctor=x.constructor;x=new Ctor(x);if(dp===void 0)return x;checkInt32(
dp,0,MAX_DIGITS);if(rm===void 0)rm=Ctor.rounding;else checkInt32(rm,0,8);return round(x,dp+getBase10Exponent(x)+1,rm)};P.toExponential=function(dp,rm){var str,x=this,
Ctor=x.constructor;if(dp===void 0){str=toString(x,true)}else{checkInt32(dp,0,MAX_DIGITS);if(rm===void 0)rm=Ctor.rounding;else checkInt32(rm,0,8);x=round(new Ctor(
x),dp+1,rm);str=toString(x,true,dp+1)}return str};P.toFixed=function(dp,rm){var str,y,x=this,Ctor=x.constructor;if(dp===void 0)return toString(x);checkInt32(dp,
0,MAX_DIGITS);if(rm===void 0)rm=Ctor.rounding;else checkInt32(rm,0,8);y=round(new Ctor(x),dp+getBase10Exponent(x)+1,rm);str=toString(y.abs(),false,dp+getBase10Exponent(
y)+1);return x.isneg()&&!x.isZero()?"-"+str:str};P.toInteger=P.toint=function(){var x=this,Ctor=x.constructor;return round(new Ctor(x),getBase10Exponent(x)+1,Ctor.
rounding)};P.toNumber=function(){return+this};P.toPower=P.pow=function(y){var e,k,pr,r,sign,yIsInt,x=this,Ctor=x.constructor,guard=12,yn=+(y=new Ctor(y));if(!y.
s)return new Ctor(ONE);x=new Ctor(x);if(!x.s){if(y.s<1)throw Error(decimalError+"Infinity");return x}if(x.eq(ONE))return x;pr=Ctor.precision;if(y.eq(ONE))return round(
x,pr);e=y.e;k=y.d.length-1;yIsInt=e>=k;sign=x.s;if(!yIsInt){if(sign<0)throw Error(decimalError+"NaN")}else if((k=yn<0?-yn:yn)<=MAX_SAFE_INTEGER){r=new Ctor(ONE);
e=Math.ceil(pr/LOG_BASE+4);external=false;for(;;){if(k%2){r=r.times(x);truncate(r.d,e)}k=mathfloor(k/2);if(k===0)break;x=x.times(x);truncate(x.d,e)}external=true;
return y.s<0?new Ctor(ONE).div(r):round(r,pr)}sign=sign<0&&y.d[Math.max(e,k)]&1?-1:1;x.s=1;external=false;r=y.times(ln(x,pr+guard));external=true;r=exp(r);r.s=sign;
return r};P.toPrecision=function(sd,rm){var e,str,x=this,Ctor=x.constructor;if(sd===void 0){e=getBase10Exponent(x);str=toString(x,e<=Ctor.toExpNeg||e>=Ctor.toExpPos)}else{
checkInt32(sd,1,MAX_DIGITS);if(rm===void 0)rm=Ctor.rounding;else checkInt32(rm,0,8);x=round(new Ctor(x),sd,rm);e=getBase10Exponent(x);str=toString(x,sd<=e||e<=Ctor.
toExpNeg,sd)}return str};P.toSignificantDigits=P.tosd=function(sd,rm){var x=this,Ctor=x.constructor;if(sd===void 0){sd=Ctor.precision;rm=Ctor.rounding}else{checkInt32(
sd,1,MAX_DIGITS);if(rm===void 0)rm=Ctor.rounding;else checkInt32(rm,0,8)}return round(new Ctor(x),sd,rm)};P.toString=P.valueOf=P.val=P.toJSON=P[Symbol.for("node\
js.util.inspect.custom")]=function(){var x=this,e=getBase10Exponent(x),Ctor=x.constructor;return toString(x,e<=Ctor.toExpNeg||e>=Ctor.toExpPos)};function add(x,y){
var carry,d,e,i,k,len,xd,yd,Ctor=x.constructor,pr=Ctor.precision;if(!x.s||!y.s){if(!y.s)y=new Ctor(x);return external?round(y,pr):y}xd=x.d;yd=y.d;k=x.e;e=y.e;xd=
xd.slice();i=k-e;if(i){if(i<0){d=xd;i=-i;len=yd.length}else{d=yd;e=k;len=xd.length}k=Math.ceil(pr/LOG_BASE);len=k>len?k+1:len+1;if(i>len){i=len;d.length=1}d.reverse();
for(;i--;)d.push(0);d.reverse()}len=xd.length;i=yd.length;if(len-i<0){i=len;d=yd;yd=xd;xd=d}for(carry=0;i;){carry=(xd[--i]=xd[i]+yd[i]+carry)/BASE|0;xd[i]%=BASE}
if(carry){xd.unshift(carry);++e}for(len=xd.length;xd[--len]==0;)xd.pop();y.d=xd;y.e=e;return external?round(y,pr):y}function checkInt32(i,min,max){if(i!==~~i||i<
min||i>max){throw Error(invalidArgument+i)}}function digitsToString(d){var i,k,ws,indexOfLastWord=d.length-1,str="",w=d[0];if(indexOfLastWord>0){str+=w;for(i=1;i<
indexOfLastWord;i++){ws=d[i]+"";k=LOG_BASE-ws.length;if(k)str+=getZeroString(k);str+=ws}w=d[i];ws=w+"";k=LOG_BASE-ws.length;if(k)str+=getZeroString(k)}else if(w===
0){return"0"}for(;w%10===0;)w/=10;return str+w}var divide=(function(){function multiplyInteger(x,k){var temp,carry=0,i=x.length;for(x=x.slice();i--;){temp=x[i]*
k+carry;x[i]=temp%BASE|0;carry=temp/BASE|0}if(carry)x.unshift(carry);return x}function compare(a,b,aL,bL){var i,r;if(aL!=bL){r=aL>bL?1:-1}else{for(i=r=0;i<aL;i++){
if(a[i]!=b[i]){r=a[i]>b[i]?1:-1;break}}}return r}function subtract2(a,b,aL){var i=0;for(;aL--;){a[aL]-=i;i=a[aL]<b[aL]?1:0;a[aL]=i*BASE+a[aL]-b[aL]}for(;!a[0]&&
a.length>1;)a.shift()}return function(x,y,pr,dp){var cmp,e,i,k,prod,prodL,q,qd,rem,remL,rem0,sd,t,xi,xL,yd0,yL,yz,Ctor=x.constructor,sign=x.s==y.s?1:-1,xd=x.d,yd=y.
d;if(!x.s)return new Ctor(x);if(!y.s)throw Error(decimalError+"Division by zero");e=x.e-y.e;yL=yd.length;xL=xd.length;q=new Ctor(sign);qd=q.d=[];for(i=0;yd[i]==
(xd[i]||0);)++i;if(yd[i]>(xd[i]||0))--e;if(pr==null){sd=pr=Ctor.precision}else if(dp){sd=pr+(getBase10Exponent(x)-getBase10Exponent(y))+1}else{sd=pr}if(sd<0)return new Ctor(
0);sd=sd/LOG_BASE+2|0;i=0;if(yL==1){k=0;yd=yd[0];sd++;for(;(i<xL||k)&&sd--;i++){t=k*BASE+(xd[i]||0);qd[i]=t/yd|0;k=t%yd|0}}else{k=BASE/(yd[0]+1)|0;if(k>1){yd=multiplyInteger(
yd,k);xd=multiplyInteger(xd,k);yL=yd.length;xL=xd.length}xi=yL;rem=xd.slice(0,yL);remL=rem.length;for(;remL<yL;)rem[remL++]=0;yz=yd.slice();yz.unshift(0);yd0=yd[0];
if(yd[1]>=BASE/2)++yd0;do{k=0;cmp=compare(yd,rem,yL,remL);if(cmp<0){rem0=rem[0];if(yL!=remL)rem0=rem0*BASE+(rem[1]||0);k=rem0/yd0|0;if(k>1){if(k>=BASE)k=BASE-1;
prod=multiplyInteger(yd,k);prodL=prod.length;remL=rem.length;cmp=compare(prod,rem,prodL,remL);if(cmp==1){k--;subtract2(prod,yL<prodL?yz:yd,prodL)}}else{if(k==0)
cmp=k=1;prod=yd.slice()}prodL=prod.length;if(prodL<remL)prod.unshift(0);subtract2(rem,prod,remL);if(cmp==-1){remL=rem.length;cmp=compare(yd,rem,yL,remL);if(cmp<
1){k++;subtract2(rem,yL<remL?yz:yd,remL)}}remL=rem.length}else if(cmp===0){k++;rem=[0]}qd[i++]=k;if(cmp&&rem[0]){rem[remL++]=xd[xi]||0}else{rem=[xd[xi]];remL=1}}while((xi++<
xL||rem[0]!==void 0)&&sd--)}if(!qd[0])qd.shift();q.e=e;return round(q,dp?pr+getBase10Exponent(q)+1:pr)}})();function exp(x,sd){var denominator,guard,pow,sum,t,wpr,
i=0,k=0,Ctor=x.constructor,pr=Ctor.precision;if(getBase10Exponent(x)>16)throw Error(exponentOutOfRange+getBase10Exponent(x));if(!x.s)return new Ctor(ONE);if(sd==
null){external=false;wpr=pr}else{wpr=sd}t=new Ctor(.03125);while(x.abs().gte(.1)){x=x.times(t);k+=5}guard=Math.log(mathpow(2,k))/Math.LN10*2+5|0;wpr+=guard;denominator=
pow=sum=new Ctor(ONE);Ctor.precision=wpr;for(;;){pow=round(pow.times(x),wpr);denominator=denominator.times(++i);t=sum.plus(divide(pow,denominator,wpr));if(digitsToString(
t.d).slice(0,wpr)===digitsToString(sum.d).slice(0,wpr)){while(k--)sum=round(sum.times(sum),wpr);Ctor.precision=pr;return sd==null?(external=true,round(sum,pr)):
sum}sum=t}}function getBase10Exponent(x){var e=x.e*LOG_BASE,w=x.d[0];for(;w>=10;w/=10)e++;return e}function getLn10(Ctor,sd,pr){if(sd>Ctor.LN10.sd()){external=true;
if(pr)Ctor.precision=pr;throw Error(decimalError+"LN10 precision limit exceeded")}return round(new Ctor(Ctor.LN10),sd)}function getZeroString(k){var zs="";for(;k--;)
zs+="0";return zs}function ln(y,sd){var c,c0,denominator,e,numerator,sum,t,wpr,x2,n=1,guard=10,x=y,xd=x.d,Ctor=x.constructor,pr=Ctor.precision;if(x.s<1)throw Error(
decimalError+(x.s?"NaN":"-Infinity"));if(x.eq(ONE))return new Ctor(0);if(sd==null){external=false;wpr=pr}else{wpr=sd}if(x.eq(10)){if(sd==null)external=true;return getLn10(
Ctor,wpr)}wpr+=guard;Ctor.precision=wpr;c=digitsToString(xd);c0=c.charAt(0);e=getBase10Exponent(x);if(Math.abs(e)<15e14){while(c0<7&&c0!=1||c0==1&&c.charAt(1)>3){
x=x.times(y);c=digitsToString(x.d);c0=c.charAt(0);n++}e=getBase10Exponent(x);if(c0>1){x=new Ctor("0."+c);e++}else{x=new Ctor(c0+"."+c.slice(1))}}else{t=getLn10(
Ctor,wpr+2,pr).times(e+"");x=ln(new Ctor(c0+"."+c.slice(1)),wpr-guard).plus(t);Ctor.precision=pr;return sd==null?(external=true,round(x,pr)):x}sum=numerator=x=divide(
x.minus(ONE),x.plus(ONE),wpr);x2=round(x.times(x),wpr);denominator=3;for(;;){numerator=round(numerator.times(x2),wpr);t=sum.plus(divide(numerator,new Ctor(denominator),
wpr));if(digitsToString(t.d).slice(0,wpr)===digitsToString(sum.d).slice(0,wpr)){sum=sum.times(2);if(e!==0)sum=sum.plus(getLn10(Ctor,wpr+2,pr).times(e+""));sum=divide(
sum,new Ctor(n),wpr);Ctor.precision=pr;return sd==null?(external=true,round(sum,pr)):sum}sum=t;denominator+=2}}function parseDecimal(x,str){var e,i,len;if((e=str.
indexOf("."))>-1)str=str.replace(".","");if((i=str.search(/e/i))>0){if(e<0)e=i;e+=+str.slice(i+1);str=str.substring(0,i)}else if(e<0){e=str.length}for(i=0;str.charCodeAt(
i)===48;)++i;for(len=str.length;str.charCodeAt(len-1)===48;)--len;str=str.slice(i,len);if(str){len-=i;e=e-i-1;x.e=mathfloor(e/LOG_BASE);x.d=[];i=(e+1)%LOG_BASE;
if(e<0)i+=LOG_BASE;if(i<len){if(i)x.d.push(+str.slice(0,i));for(len-=LOG_BASE;i<len;)x.d.push(+str.slice(i,i+=LOG_BASE));str=str.slice(i);i=LOG_BASE-str.length}else{
i-=len}for(;i--;)str+="0";x.d.push(+str);if(external&&(x.e>MAX_E||x.e<-MAX_E))throw Error(exponentOutOfRange+e)}else{x.s=0;x.e=0;x.d=[0]}return x}function round(x,sd,rm){
var i,j,k,n,rd,doRound,w,xdi,xd=x.d;for(n=1,k=xd[0];k>=10;k/=10)n++;i=sd-n;if(i<0){i+=LOG_BASE;j=sd;w=xd[xdi=0]}else{xdi=Math.ceil((i+1)/LOG_BASE);k=xd.length;if(xdi>=
k)return x;w=k=xd[xdi];for(n=1;k>=10;k/=10)n++;i%=LOG_BASE;j=i-LOG_BASE+n}if(rm!==void 0){k=mathpow(10,n-j-1);rd=w/k%10|0;doRound=sd<0||xd[xdi+1]!==void 0||w%k;
doRound=rm<4?(rd||doRound)&&(rm==0||rm==(x.s<0?3:2)):rd>5||rd==5&&(rm==4||doRound||rm==6&&(i>0?j>0?w/mathpow(10,n-j):0:xd[xdi-1])%10&1||rm==(x.s<0?8:7))}if(sd<1||
!xd[0]){if(doRound){k=getBase10Exponent(x);xd.length=1;sd=sd-k-1;xd[0]=mathpow(10,(LOG_BASE-sd%LOG_BASE)%LOG_BASE);x.e=mathfloor(-sd/LOG_BASE)||0}else{xd.length=
1;xd[0]=x.e=x.s=0}return x}if(i==0){xd.length=xdi;k=1;xdi--}else{xd.length=xdi+1;k=mathpow(10,LOG_BASE-i);xd[xdi]=j>0?(w/mathpow(10,n-j)%mathpow(10,j)|0)*k:0}if(doRound){
for(;;){if(xdi==0){if((xd[0]+=k)==BASE){xd[0]=1;++x.e}break}else{xd[xdi]+=k;if(xd[xdi]!=BASE)break;xd[xdi--]=0;k=1}}}for(i=xd.length;xd[--i]===0;)xd.pop();if(external&&
(x.e>MAX_E||x.e<-MAX_E)){throw Error(exponentOutOfRange+getBase10Exponent(x))}return x}function subtract(x,y){var d,e,i,j,k,len,xd,xe,xLTy,yd,Ctor=x.constructor,
pr=Ctor.precision;if(!x.s||!y.s){if(y.s)y.s=-y.s;else y=new Ctor(x);return external?round(y,pr):y}xd=x.d;yd=y.d;e=y.e;xe=x.e;xd=xd.slice();k=xe-e;if(k){xLTy=k<0;
if(xLTy){d=xd;k=-k;len=yd.length}else{d=yd;e=xe;len=xd.length}i=Math.max(Math.ceil(pr/LOG_BASE),len)+2;if(k>i){k=i;d.length=1}d.reverse();for(i=k;i--;)d.push(0);
d.reverse()}else{i=xd.length;len=yd.length;xLTy=i<len;if(xLTy)len=i;for(i=0;i<len;i++){if(xd[i]!=yd[i]){xLTy=xd[i]<yd[i];break}}k=0}if(xLTy){d=xd;xd=yd;yd=d;y.s=
-y.s}len=xd.length;for(i=yd.length-len;i>0;--i)xd[len++]=0;for(i=yd.length;i>k;){if(xd[--i]<yd[i]){for(j=i;j&&xd[--j]===0;)xd[j]=BASE-1;--xd[j];xd[i]+=BASE}xd[i]-=
yd[i]}for(;xd[--len]===0;)xd.pop();for(;xd[0]===0;xd.shift())--e;if(!xd[0])return new Ctor(0);y.d=xd;y.e=e;return external?round(y,pr):y}function toString(x,isExp,sd){
var k,e=getBase10Exponent(x),str=digitsToString(x.d),len=str.length;if(isExp){if(sd&&(k=sd-len)>0){str=str.charAt(0)+"."+str.slice(1)+getZeroString(k)}else if(len>
1){str=str.charAt(0)+"."+str.slice(1)}str=str+(e<0?"e":"e+")+e}else if(e<0){str="0."+getZeroString(-e-1)+str;if(sd&&(k=sd-len)>0)str+=getZeroString(k)}else if(e>=
len){str+=getZeroString(e+1-len);if(sd&&(k=sd-e-1)>0)str=str+"."+getZeroString(k)}else{if((k=e+1)<len)str=str.slice(0,k)+"."+str.slice(k);if(sd&&(k=sd-len)>0){if(e+
1===len)str+=".";str+=getZeroString(k)}}return x.s<0?"-"+str:str}function truncate(arr,len){if(arr.length>len){arr.length=len;return true}}function clone(obj){var i,
p,ps;function Decimal2(value){var x=this;if(!(x instanceof Decimal2))return new Decimal2(value);x.constructor=Decimal2;if(value instanceof Decimal2){x.s=value.s;
x.e=value.e;x.d=(value=value.d)?value.slice():value;return}if(typeof value==="number"){if(value*0!==0){throw Error(invalidArgument+value)}if(value>0){x.s=1}else if(value<
0){value=-value;x.s=-1}else{x.s=0;x.e=0;x.d=[0];return}if(value===~~value&&value<1e7){x.e=0;x.d=[value];return}return parseDecimal(x,value.toString())}else if(typeof value!==
"string"){throw Error(invalidArgument+value)}if(value.charCodeAt(0)===45){value=value.slice(1);x.s=-1}else{x.s=1}if(isDecimal.test(value))parseDecimal(x,value);else
throw Error(invalidArgument+value)}Decimal2.prototype=P;Decimal2.ROUND_UP=0;Decimal2.ROUND_DOWN=1;Decimal2.ROUND_CEIL=2;Decimal2.ROUND_FLOOR=3;Decimal2.ROUND_HALF_UP=
4;Decimal2.ROUND_HALF_DOWN=5;Decimal2.ROUND_HALF_EVEN=6;Decimal2.ROUND_HALF_CEIL=7;Decimal2.ROUND_HALF_FLOOR=8;Decimal2.clone=clone;Decimal2.config=Decimal2.set=
config;if(obj===void 0)obj={};if(obj){ps=["precision","rounding","toExpNeg","toExpPos","LN10"];for(i=0;i<ps.length;)if(!obj.hasOwnProperty(p=ps[i++]))obj[p]=this[p]}
Decimal2.config(obj);return Decimal2}function config(obj){if(!obj||typeof obj!=="object"){throw Error(decimalError+"Object expected")}var i,p,v,ps=["precision",
1,MAX_DIGITS,"rounding",0,8,"toExpNeg",-1/0,0,"toExpPos",0,1/0];for(i=0;i<ps.length;i+=3){if((v=obj[p=ps[i]])!==void 0){if(mathfloor(v)===v&&v>=ps[i+1]&&v<=ps[i+
2])this[p]=v;else throw Error(invalidArgument+p+": "+v)}}if((v=obj[p="LN10"])!==void 0){if(v==Math.LN10)this[p]=new this(v);else throw Error(invalidArgument+p+"\
: "+v)}return this}var Decimal=clone(defaults);ONE=new Decimal(1);var decimal_default=Decimal;var PLAIN_NUMERIC_PATTERN=/^[-+]?(?:\d+|\d*\.\d+)$/;var COMMA_NUMERIC_PATTERN=/^[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;function zeroDecimal(){return new decimal_default(
0)}function parseDecimal2(value,fieldName){if(value===null||value===void 0){return zeroDecimal()}if(typeof value==="number"){if(!Number.isFinite(value)){throw new Error(
`${fieldName}\u6570\u503C\u683C\u5F0F\u4E0D\u6B63\u786E\uFF1A${String(value)}`)}return new decimal_default(value)}const text=normalizeText(value);if(text===""){
return zeroDecimal()}if(!PLAIN_NUMERIC_PATTERN.test(text)&&!COMMA_NUMERIC_PATTERN.test(text)){throw new Error(`${fieldName}\u6570\u503C\u683C\u5F0F\u4E0D\u6B63\u786E\uFF1A${String(
value)}`)}return new decimal_default(text.replace(/,/g,""))}function addDecimal(left,right){return left.plus(right)}function subtractDecimal(left,right){return left.
minus(right)}function decimalToNumber2(value){return Number(value.toDecimalPlaces(2,decimal_default.ROUND_HALF_UP).toString())}function parseFilters(input={}){const source=input!=null?input:{};const filters={company:normalizeText(source.company),dept1:normalizeText(source.dept1),dept2:normalizeText(
source.dept2),startDate:normalizeDateKey(source.startDate),endDate:normalizeDateKey(source.endDate)};if(filters.startDate&&filters.endDate&&filters.startDate>filters.
endDate){throw new Error(`\u5F00\u59CB\u65E5\u671F\u4E0D\u80FD\u665A\u4E8E\u7ED3\u675F\u65E5\u671F\uFF1A${filters.startDate} > ${filters.endDate}`)}return filters}
function isDateInRange(dateKey,filters){const activeFilters=filters!=null?filters:parseFilters();if(!dateKey){return false}if(activeFilters.startDate&&dateKey<activeFilters.
startDate){return false}if(activeFilters.endDate&&dateKey>activeFilters.endDate){return false}return true}function matchesOrgFilters(company,dept1,dept2,filters){
const activeFilters=filters!=null?filters:parseFilters();if(activeFilters.company&&normalizeText(company)!==activeFilters.company){return false}if(activeFilters.
dept1&&normalizeText(dept1)!==activeFilters.dept1){return false}if(activeFilters.dept2&&normalizeText(dept2)!==activeFilters.dept2){return false}return true}function makeDetailKey(formNumber,itemCode){
return`${normalizeText(formNumber)}||${normalizeText(itemCode)}`}function buildOaRows(oaRows,filters){const result=new Map;const activeRows=oaRows!=null?oaRows:
[];const activeFilters=filters!=null?filters:parseFilters();for(const row of activeRows){const dateKey=normalizeDateKey(row["\u7533\u8BF7\u65E5\u671F"]);if(!isDateInRange(
dateKey,activeFilters)){continue}if(!matchesOrgFilters(row["\u516C\u53F8\u7B80\u79F0"],row["\u4E00\u7EA7\u90E8\u95E8"],row["\u4E8C\u7EA7\u90E8\u95E8"],activeFilters)){
continue}const formNumber=normalizeText(row["\u8868\u5355\u7F16\u53F7"]);const itemCode=normalizeText(row["\u7269\u6599\u4EE3\u7801"]);if(!formNumber||!itemCode){
continue}const key=makeDetailKey(formNumber,itemCode);let target=result.get(key);if(!target){target={formNumber,itemCode,itemName:normalizeText(row["\u7269\u6599\u540D\u79F0"]),
company:normalizeText(row["\u516C\u53F8\u7B80\u79F0"]),dept1:normalizeText(row["\u4E00\u7EA7\u90E8\u95E8"]),dept2:normalizeText(row["\u4E8C\u7EA7\u90E8\u95E8"]),
oaDate:"",quantity:zeroDecimal(),amount:zeroDecimal()};result.set(key,target)}target.oaDate=appendUniqueJoinedText(target.oaDate,dateKey);target.quantity=addDecimal(
target.quantity,parseDecimal2(row["\u6570\u91CF"],"\u6570\u91CF"));target.amount=addDecimal(target.amount,parseDecimal2(row["\u5B9E\u9645\u9884\u7B97\u91D1\u989Dmx"],
"\u5B9E\u9645\u9884\u7B97\u91D1\u989Dmx"))}return result}function collectSelectedOaForms(oaGroupedRows){const result=new Set;for(const row of(oaGroupedRows!=null?
oaGroupedRows:new Map).values()){if(row.formNumber){result.add(row.formNumber)}}return result}function addErpRowToGroup(result,row,sourceFormNumber,itemCode,dateKey){const key=makeDetailKey(sourceFormNumber,itemCode);const docNumber=normalizeText(row["\u5355\u636E\
\u7F16\u53F7"]);let target=result.get(key);if(!target){target={sourceFormNumber,formNumber:sourceFormNumber,itemCode,itemName:normalizeText(row["\u7269\u6599\u540D\u79F0"]),
company:normalizeText(row["\u533A\u5206\u516C\u53F8\u7B80\u79F0"]),dept1:normalizeText(row["\u4E00\u7EA7\u90E8\u95E8"]),dept2:normalizeText(row["\u4E8C\u7EA7\u90E8\u95E8"]),
erpDate:"",quantity:zeroDecimal(),cost:zeroDecimal(),erpDocNumbers:""};result.set(key,target)}target.erpDate=appendUniqueJoinedText(target.erpDate,dateKey);target.
erpDocNumbers=appendUniqueJoinedText(target.erpDocNumbers,docNumber,",");target.quantity=addDecimal(target.quantity,parseDecimal2(row["\u5B9E\u53D1\u6570\u91CF"],
"\u5B9E\u53D1\u6570\u91CF"));target.cost=addDecimal(target.cost,parseDecimal2(row["\u603B\u6210\u672C"],"\u603B\u6210\u672C"))}function buildErpRowsForOa(erpRows,oaGroupedRows){
const result=new Map;const selectedForms=collectSelectedOaForms(oaGroupedRows);for(const row of erpRows!=null?erpRows:[]){const sourceFormNumber=normalizeText(row["\
\u6E90\u5355\u5355\u53F7"]);const itemCode=normalizeText(row["\u7269\u6599\u7F16\u7801"]);if(!sourceFormNumber||!itemCode||!selectedForms.has(sourceFormNumber)){
continue}const dateKey=normalizeDateKey(row["\u65E5\u671F"]);addErpRowToGroup(result,row,sourceFormNumber,itemCode,dateKey)}return result}function buildErpOnlyRows(erpRows,currentOaFormNumbers,filters){
const result=new Map;const activeFormNumbers=currentOaFormNumbers!=null?currentOaFormNumbers:new Set;const activeFilters=filters!=null?filters:parseFilters();for(const row of erpRows!=
null?erpRows:[]){const dateKey=normalizeDateKey(row["\u65E5\u671F"]);if(!isDateInRange(dateKey,activeFilters)){continue}if(!matchesOrgFilters(row["\u533A\u5206\u516C\u53F8\u7B80\u79F0"],
row["\u4E00\u7EA7\u90E8\u95E8"],row["\u4E8C\u7EA7\u90E8\u95E8"],activeFilters)){continue}const sourceFormNumber=normalizeText(row["\u6E90\u5355\u5355\u53F7"]);const itemCode=normalizeText(
row["\u7269\u6599\u7F16\u7801"]);if(!sourceFormNumber||!itemCode||activeFormNumbers.has(sourceFormNumber)){continue}addErpRowToGroup(result,row,sourceFormNumber,
itemCode,dateKey)}return result}function makeSummaryKey(row){return`${normalizeText(row.company)}||${normalizeText(row.dept1)}||${normalizeText(row.dept2)}`}function buildSummaryRows(detailRows){
const grouped=new Map;for(const row of detailRows!=null?detailRows:[]){const key=makeSummaryKey(row);let summary=grouped.get(key);if(!summary){summary={company:normalizeText(
row.company),dept1:normalizeText(row.dept1),dept2:normalizeText(row.dept2),oaQuantity:zeroDecimal(),erpQuantity:zeroDecimal(),oaAmount:zeroDecimal(),erpCost:zeroDecimal(),
differenceTypes:new Set};grouped.set(key,summary)}summary.oaQuantity=addDecimal(summary.oaQuantity,parseDecimal2(row.oaQuantity,"OA\u6570\u91CF\u5408\u8BA1"));summary.
erpQuantity=addDecimal(summary.erpQuantity,parseDecimal2(row.erpQuantity,"ERP\u5B9E\u53D1\u6570\u91CF\u5408\u8BA1"));summary.oaAmount=addDecimal(summary.oaAmount,
parseDecimal2(row.oaAmount,"OA\u5B9E\u9645\u9884\u7B97\u91D1\u989Dmx\u5408\u8BA1"));summary.erpCost=addDecimal(summary.erpCost,parseDecimal2(row.erpCost,"ERP\u603B\u6210\u672C\
\u5408\u8BA1"));const differenceType=normalizeText(row.differenceType);if(differenceType){summary.differenceTypes.add(differenceType)}}const result=[];for(const summary of grouped.
values()){const quantityDiff=subtractDecimal(summary.oaQuantity,summary.erpQuantity);const amountDiff=subtractDecimal(summary.oaAmount,summary.erpCost);result.push(
{company:summary.company,dept1:summary.dept1,dept2:summary.dept2,oaQuantity:decimalToNumber2(summary.oaQuantity),erpQuantity:decimalToNumber2(summary.erpQuantity),
quantityDiff:decimalToNumber2(quantityDiff),oaAmount:decimalToNumber2(summary.oaAmount),erpCost:decimalToNumber2(summary.erpCost),amountDiff:decimalToNumber2(amountDiff),
differenceSummary:DIFFERENCE_TYPE_PRIORITY.filter(type=>summary.differenceTypes.has(type)).join("\u3001")})}return result}function summaryRowsToValues(summaryRows){
return[[...SUMMARY_HEADERS],...(summaryRows!=null?summaryRows:[]).map(row=>[row.company,row.dept1,row.dept2,row.oaQuantity,row.erpQuantity,row.quantityDiff,row.
oaAmount,row.erpCost,row.amountDiff,row.differenceSummary])]}function detailRowsToValues(detailRows){return[[...DETAIL_HEADERS],...(detailRows!=null?detailRows:
[]).map(row=>[row.differenceType,row.formNumber,row.oaDate,row.erpDocNumbers,row.erpDate,row.itemCode,row.itemName,row.company,row.dept1,row.dept2,row.oaQuantity,
row.erpQuantity,row.quantityDiff,row.oaAmount,row.erpCost,row.amountDiff,row.remark])]}function buildFormNumberSet(groupedRows){const result=new Set;for(const[key,row]of(groupedRows!=null?groupedRows:new Map).entries()){const formNumber=normalizeText(
row.formNumber||row.sourceFormNumber||key.split("||")[0]);if(formNumber){result.add(formNumber)}}return result}function buildDifference(differenceType,oa,erp){var _a,
_b,_c;const formNumber=normalizeText((oa==null?void 0:oa.formNumber)||(erp==null?void 0:erp.formNumber)||(erp==null?void 0:erp.sourceFormNumber));const itemCode=normalizeText(
(oa==null?void 0:oa.itemCode)||(erp==null?void 0:erp.itemCode));const itemName=normalizeText((oa==null?void 0:oa.itemName)||(erp==null?void 0:erp.itemName));const company=normalizeText(
(oa==null?void 0:oa.company)||(erp==null?void 0:erp.company));const dept1=normalizeText((oa==null?void 0:oa.dept1)||(erp==null?void 0:erp.dept1));const dept2=normalizeText(
(oa==null?void 0:oa.dept2)||(erp==null?void 0:erp.dept2));const oaQuantity=oa?decimalToNumber2(oa.quantity):0;const erpQuantity=erp?decimalToNumber2(erp.quantity):
0;const oaAmount=oa?decimalToNumber2(oa.amount):0;const erpCost=erp?decimalToNumber2(erp.cost):0;return{differenceType,formNumber,oaDate:(_a=oa==null?void 0:oa.
oaDate)!=null?_a:"",erpDocNumbers:(_b=erp==null?void 0:erp.erpDocNumbers)!=null?_b:"",erpDate:(_c=erp==null?void 0:erp.erpDate)!=null?_c:"",itemCode,itemName,company,
dept1,dept2,oaQuantity,erpQuantity,quantityDiff:decimalToNumber2(subtractDecimal(parseDecimal2(oaQuantity,"OA\u6570\u91CF\u5408\u8BA1"),parseDecimal2(erpQuantity,
"ERP\u5B9E\u53D1\u6570\u91CF\u5408\u8BA1"))),oaAmount,erpCost,amountDiff:decimalToNumber2(subtractDecimal(parseDecimal2(oaAmount,"OA\u5B9E\u9645\u9884\u7B97\u91D1\u989Dmx\u5408\u8BA1"),
parseDecimal2(erpCost,"ERP\u603B\u6210\u672C\u5408\u8BA1"))),remark:differenceType==="ERP\u51FA\u5E93\u5BF9\u5E94OA\u672A\u5728\u5F53\u524DOA\u6570\u636E\u4E2D\u627E\u5230"?
"\u8BF7\u7528 ERP \u6E90\u5355\u5355\u53F7\u56DE OA \u7CFB\u7EDF\u8865\u67E5\u3002":""}}function compareRows(oaRows,erpRowsForOa,erpOnlyRows){const details=[];const erpFormNumbers=buildFormNumberSet(
erpRowsForOa);const activeOaRows=oaRows!=null?oaRows:new Map;const activeErpRowsForOa=erpRowsForOa!=null?erpRowsForOa:new Map;const activeErpOnlyRows=erpOnlyRows!=
null?erpOnlyRows:new Map;for(const[key,oa]of activeOaRows.entries()){const erp=activeErpRowsForOa.get(key);const formNumber=normalizeText((oa==null?void 0:oa.formNumber)||
key.split("||")[0]);let differenceType;if(oa&&!erp&&!erpFormNumbers.has(formNumber)){differenceType="OA\u6709\u7533\u8BF7\uFF0CERP\u65E0\u51FA\u5E93"}else if(!oa||
!erp){differenceType="OA\u548CERP\u90FD\u6709\uFF0C\u4F46\u7269\u6599\u660E\u7EC6\u4E0D\u4E00\u81F4"}else if(decimalToNumber2(oa.quantity)!==decimalToNumber2(erp.
quantity)){differenceType="OA\u548CERP\u90FD\u6709\uFF0C\u4F46\u6570\u91CF\u4E0D\u540C"}else{differenceType="OA\u548CERP\u90FD\u6709\uFF0C\u6570\u91CF\u4E00\u81F4"}
details.push(buildDifference(differenceType,oa,erp))}for(const[key,erp]of activeErpRowsForOa.entries()){if(activeOaRows.has(key)){continue}details.push(buildDifference(
"OA\u548CERP\u90FD\u6709\uFF0C\u4F46\u7269\u6599\u660E\u7EC6\u4E0D\u4E00\u81F4",void 0,erp))}for(const erp of activeErpOnlyRows.values()){details.push(buildDifference(
"ERP\u51FA\u5E93\u5BF9\u5E94OA\u672A\u5728\u5F53\u524DOA\u6570\u636E\u4E2D\u627E\u5230",void 0,erp))}return details}var UNKNOWN_MEMORY="\u65E0\u786E\u5207\u4FE1\u606F";var PROCESS_MEMORY_USAGE_SOURCE=["process","memoryUsage"].join(".");function unknownMemorySample(){return{available:false,
heapUsedMb:UNKNOWN_MEMORY,rssMb:UNKNOWN_MEMORY}}function isFiniteNumber(value){return typeof value==="number"&&Number.isFinite(value)}function bytesToMb(value){
return Number((value/1024/1024).toFixed(2))}function getProcessMemorySample(root2){var _a;const processRoot=root2;const usage=(_a=processRoot.process)==null?void 0:
_a.memoryUsage;if(typeof usage!=="function"){return unknownMemorySample()}let sample;try{sample=usage()}catch(e){return unknownMemorySample()}if(!isFiniteNumber(
sample.heapUsed)||!isFiniteNumber(sample.rss)){return unknownMemorySample()}return{available:true,source:PROCESS_MEMORY_USAGE_SOURCE,heapUsedMb:bytesToMb(sample.
heapUsed),rssMb:bytesToMb(sample.rss)}}function getPerformanceMemorySample(root2){var _a;const performanceRoot=root2;const memory=(_a=performanceRoot.performance)==
null?void 0:_a.memory;const usedJSHeapSize=memory==null?void 0:memory.usedJSHeapSize;if(!isFiniteNumber(usedJSHeapSize)){return unknownMemorySample()}return{available:true,
source:"performance.memory",heapUsedMb:bytesToMb(usedJSHeapSize),rssMb:UNKNOWN_MEMORY}}function getMemorySample(root2=globalThis){const processSample=getProcessMemorySample(
root2);if(processSample.available){return processSample}return getPerformanceMemorySample(root2)}function memoryDeltaMb(before,after){if(!before.available||!after.
available){return UNKNOWN_MEMORY}return Number((after.heapUsedMb-before.heapUsedMb).toFixed(2))}function nowMs(root2=globalThis){var _a;const timerRoot=root2;if(typeof((_a=timerRoot.performance)==null?void 0:_a.now)==="function"){return timerRoot.performance.
now()}return Date.now()}function errorMessage(error){return error instanceof Error?error.message:String(error)}function resolveOutputRows(value,outputRows){if(typeof outputRows==="func\
tion"){try{return{outputRows:outputRows(value)}}catch(error){return{outputRows:0,note:`outputRows \u7EDF\u8BA1\u5931\u8D25\uFF1A${errorMessage(error)}`}}}if(typeof outputRows===
"number"&&Number.isFinite(outputRows)){return{outputRows}}return{outputRows:0}}function roundMs(value){return Number(value.toFixed(2))}function createMetricsRecorder(root2=globalThis){
const stages=[];return{stages,measure(name,options,action){var _a,_b,_c,_d;const memoryBefore=getMemorySample(root2);const startedAt=nowMs(root2);try{const value=action();
const endedAt=nowMs(root2);const memoryAfter=getMemorySample(root2);const outputRowsResult=resolveOutputRows(value,options.outputRows);stages.push({name,inputRows:(_a=
options.inputRows)!=null?_a:0,outputRows:outputRowsResult.outputRows,timeMs:roundMs(endedAt-startedAt),memoryBefore,memoryAfter,heapDeltaMb:memoryDeltaMb(memoryBefore,
memoryAfter),note:(_c=(_b=outputRowsResult.note)!=null?_b:options.note)!=null?_c:""});return value}catch(error){const endedAt=nowMs(root2);const memoryAfter=getMemorySample(
root2);stages.push({name,inputRows:(_d=options.inputRows)!=null?_d:0,outputRows:0,timeMs:roundMs(endedAt-startedAt),memoryBefore,memoryAfter,heapDeltaMb:memoryDeltaMb(
memoryBefore,memoryAfter),note:errorMessage(error)});throw error}}}}function runQueryCorePipeline(oaRows,erpRows,filters,metrics=createMetricsRecorder()){const activeFilters=parseFilters(filters);const oaGroupedRows=metrics.measure(
"build_oa_rows",{inputRows:oaRows.length,outputRows:rows=>rows.size},()=>buildOaRows(oaRows,activeFilters));const currentOaFormNumbers=metrics.measure("collect_\
oa_forms",{inputRows:oaGroupedRows.size,outputRows:rows=>rows.size},()=>collectSelectedOaForms(oaGroupedRows));const erpRowsForOa=metrics.measure("build_erp_row\
s_for_oa",{inputRows:erpRows.length,outputRows:rows=>rows.size},()=>buildErpRowsForOa(erpRows,oaGroupedRows));const erpOnlyRows=metrics.measure("build_erp_only_\
rows",{inputRows:erpRows.length,outputRows:rows=>rows.size},()=>buildErpOnlyRows(erpRows,currentOaFormNumbers,activeFilters));const detailRows=metrics.measure("\
compare_rows",{inputRows:oaGroupedRows.size+erpRowsForOa.size+erpOnlyRows.size,outputRows:rows=>rows.length},()=>compareRows(oaGroupedRows,erpRowsForOa,erpOnlyRows));
const summaryRows=metrics.measure("build_summary_rows",{inputRows:detailRows.length,outputRows:rows=>rows.length},()=>buildSummaryRows(detailRows));const outputMatrices=metrics.
measure("build_output_matrix",{inputRows:detailRows.length+summaryRows.length,outputRows:detailRows.length+summaryRows.length},()=>({summaryValues:summaryRowsToValues(
summaryRows),detailValues:detailRowsToValues(detailRows)}));return{oaGroupedRows,currentOaFormNumbers,erpRowsForOa,erpOnlyRows,detailRows,summaryRows,summaryValues:outputMatrices.
summaryValues,detailValues:outputMatrices.detailValues}}var HeaderDetectionError=class _HeaderDetectionError extends Error{constructor(result){super(result.message);this.name="HeaderDetectionError";this.result=result;
Object.setPrototypeOf(this,_HeaderDetectionError.prototype)}};function rowNumberFor(index,usedRangeStartRow){if(typeof usedRangeStartRow==="number"&&Number.isFinite(
usedRangeStartRow)){return usedRangeStartRow+index}return`\u76F8\u5BF9 UsedRange \u7B2C ${index+1} \u884C`}function buildCandidate(row,rowIndex,requiredHeaders,usedRangeStartRow){
const requiredSet=new Set(requiredHeaders);const seenRequired=new Set;const columnIndex={};const duplicateRequiredHeaders=[];let duplicateRequiredCount=0;let nonBlankCount=0;
const headers=row.map((cell,colIndex)=>{const header=normalizeText(cell);if(header){nonBlankCount+=1}if(requiredSet.has(header)){if(Object.prototype.hasOwnProperty.
call(columnIndex,header)){duplicateRequiredCount+=1;if(!duplicateRequiredHeaders.includes(header)){duplicateRequiredHeaders.push(header)}}else{columnIndex[header]=
colIndex}seenRequired.add(header)}return header});return{rowIndex,rowNumber:rowNumberFor(rowIndex,usedRangeStartRow),headers,columnIndex,matchedHeaders:seenRequired,
duplicateRequiredCount,duplicateRequiredHeaders,nonBlankCount}}function compareCandidates(left,right){const matchDiff=right.matchedHeaders.size-left.matchedHeaders.
size;if(matchDiff!==0){return matchDiff}const duplicateDiff=left.duplicateRequiredCount-right.duplicateRequiredCount;if(duplicateDiff!==0){return duplicateDiff}
return right.nonBlankCount-left.nonBlankCount}function missingHeaders(requiredHeaders,candidate){if(!candidate){return requiredHeaders.slice()}return requiredHeaders.
filter(header=>!candidate.matchedHeaders.has(header))}function rowNumberLabel(rowNumber){return typeof rowNumber==="number"?`\u7B2C ${rowNumber} \u884C`:rowNumber}
function failure(issueType,requiredHeaders,candidate,scannedRows){var _a,_b,_c,_d;const matchedCount=(_a=candidate==null?void 0:candidate.matchedHeaders.size)!=
null?_a:0;const rowNumber=(_b=candidate==null?void 0:candidate.rowNumber)!=null?_b:"\u76F8\u5BF9 UsedRange \u7B2C 1 \u884C";const missing=missingHeaders(requiredHeaders,
candidate);const duplicateHeaders=(_c=candidate==null?void 0:candidate.duplicateRequiredHeaders)!=null?_c:[];const candidateContext=`\u5019\u9009\u884C\uFF1A${rowNumberLabel(
rowNumber)}\u3002`;const missingContext=missing.length>0?`\u7F3A\u5931\u5B57\u6BB5\uFF1A${missing.join("\u3001")}\u3002`:"";const duplicateContext=duplicateHeaders.
length>0?`\u91CD\u590D\u5FC5\u9700\u5B57\u6BB5\uFF1A${duplicateHeaders.join("\u3001")}\u3002`:"";let message;if(issueType==="\u5173\u952E\u5217\u91CD\u590D"){message=
`\u5173\u952E\u5217\u91CD\u590D\uFF1A${candidateContext}${duplicateContext}\u8BF7\u5220\u9664\u6216\u91CD\u547D\u540D\u91CD\u590D\u5217\u540E\u91CD\u8BD5\u3002`}else if(issueType===
"\u8868\u5934\u8BC6\u522B\u4E0D\u552F\u4E00"){message=`\u8868\u5934\u8BC6\u522B\u4E0D\u552F\u4E00\uFF1A\u5DF2\u626B\u63CF UsedRange \u524D ${scannedRows} \u884C\uFF0C\u591A\u4E2A\u5019\u9009\
\u884C\u6700\u591A\u547D\u4E2D ${matchedCount}/${requiredHeaders.length} \u4E2A\u5FC5\u9700\u5B57\u6BB5\u3002${candidateContext}${missingContext}`}else{message=
`\u65E0\u6CD5\u8BC6\u522B\u8868\u5934\uFF1A\u5DF2\u626B\u63CF UsedRange \u524D ${scannedRows} \u884C\uFF0C\u6700\u591A\u547D\u4E2D ${matchedCount}/${requiredHeaders.
length} \u4E2A\u5FC5\u9700\u5B57\u6BB5\u3002${candidateContext}${missingContext}`}return{ok:false,issueType,message,headerRowIndex:(_d=candidate==null?void 0:candidate.
rowIndex)!=null?_d:0,headerRowNumber:rowNumber,matchedCount,requiredCount:requiredHeaders.length,missingHeaders:missing,duplicateHeaders}}function detectHeaderRow(matrix,requiredHeaders,options){
const scanRows=Math.min(options.maxScanRows,matrix.length);const candidates=matrix.slice(0,scanRows).map((row,rowIndex)=>buildCandidate(row,rowIndex,requiredHeaders,
options.usedRangeStartRow));const sorted=candidates.slice().sort(compareCandidates);const best=sorted[0];if(!best||best.matchedHeaders.size<options.minMatchCount){
return failure("\u65E0\u6CD5\u8BC6\u522B\u8868\u5934",requiredHeaders,best,scanRows)}const tied=sorted.filter(candidate=>compareCandidates(candidate,best)===0);
if(tied.length>1&&best.matchedHeaders.size<requiredHeaders.length){return failure("\u8868\u5934\u8BC6\u522B\u4E0D\u552F\u4E00",requiredHeaders,best,scanRows)}const selected=tied.
length>1?tied.sort((left,right)=>left.rowIndex-right.rowIndex)[0]:best;if(selected.duplicateRequiredCount>0){return failure("\u5173\u952E\u5217\u91CD\u590D",requiredHeaders,
selected,scanRows)}return{ok:true,headerRowIndex:selected.rowIndex,headerRowNumber:selected.rowNumber,headers:selected.headers,columnIndex:selected.columnIndex,
matchedCount:selected.matchedHeaders.size}}function worksheetRowNumber(rowIndex,usedRangeStartRow){if(typeof usedRangeStartRow==="number"&&Number.isFinite(usedRangeStartRow)){return usedRangeStartRow+rowIndex}
return`\u76F8\u5BF9 UsedRange \u7B2C ${rowIndex+1} \u884C`}function parseTableFromMatrix(matrix,requiredHeaders,options){var _a;const headerResult=detectHeaderRow(
matrix,requiredHeaders,options);if(!headerResult.ok){throw new HeaderDetectionError(headerResult)}const rows=[];for(let rowIndex=headerResult.headerRowIndex+1;rowIndex<
matrix.length;rowIndex+=1){const rawRow=(_a=matrix[rowIndex])!=null?_a:[];const row={_rowNumber:worksheetRowNumber(rowIndex,options.usedRangeStartRow)};let hasValue=false;
for(let colIndex=0;colIndex<headerResult.headers.length;colIndex+=1){const header=normalizeText(headerResult.headers[colIndex]);if(!header){continue}const value=rawRow[colIndex];
row[header]=value;if(!isBlankValue(value)){hasValue=true}}if(hasValue){rows.push(row)}}return{headers:headerResult.headers,rows,headerRowNumber:headerResult.headerRowNumber,
columnIndex:headerResult.columnIndex,matrix}}function capability(name,supported){return{name,supported,note:supported?"\u652F\u6301":"\u4E0D\u652F\u6301"}}function hasFunction(rootValue,fallbackValue){return typeof rootValue===
"function"||typeof fallbackValue==="function"}function hasMemoryApi(...roots){return roots.some(root2=>getMemorySample(root2).available)}function probeRuntimeCapabilities(root2=globalThis,fallbackRoot=globalThis){
var _a,_b,_c,_d;const runtime=root2;const fallbackRuntime=fallbackRoot;return[capability("performance.now",hasFunction((_a=runtime.performance)==null?void 0:_a.
now,(_b=fallbackRuntime.performance)==null?void 0:_b.now)),capability("console.log",hasFunction((_c=runtime.console)==null?void 0:_c.log,(_d=fallbackRuntime.console)==
null?void 0:_d.log)),capability("setTimeout",hasFunction(runtime.setTimeout,fallbackRuntime.setTimeout)),capability("Promise",hasFunction(runtime.Promise,fallbackRuntime.
Promise)),capability("Worker",hasFunction(runtime.Worker,fallbackRuntime.Worker)),capability("memory_api",hasMemoryApi(runtime,fallbackRuntime))]}function isArray(value){return Object.prototype.toString.call(value)==="[object Array]"}function isNumericKey(key){return/^\d+$/.test(key)}function sortedNumericKeys(value){
return Object.keys(value).filter(isNumericKey).map(Number).sort((left,right)=>left-right)}function numericObjectToArray(value){const keys=sortedNumericKeys(value);
if(keys.length===0){return null}const offset=keys[0]===0?0:1;const result=[];for(const key of keys){result[key-offset]=value[String(key)]}return result}function numericObjectToMatrix(value){
const rowKeys=sortedNumericKeys(value);if(rowKeys.length===0){return null}const firstRow=value[String(rowKeys[0])];if(firstRow&&typeof firstRow==="object"&&(isArray(
firstRow)||sortedNumericKeys(firstRow).length>0)){return rowKeys.map(key=>{var _a;const rowValue=value[String(key)];if(isArray(rowValue)){return rowValue}return(_a=
numericObjectToArray(rowValue))!=null?_a:[rowValue]})}const row=numericObjectToArray(value);return row?[row]:null}function normalizeMatrix(values){if(isArray(values)){
if(values.length===0){return[]}if(values.every(isArray)){return values}if(values.some(isArray)){return values.map(row=>isArray(row)?row:[row])}return[values]}if(values&&
typeof values==="object"){const objectMatrix=numericObjectToMatrix(values);if(objectMatrix){return objectMatrix}}return[[values]]}function hasAnyNonBlankRow(matrix){
return matrix.some(row=>row.some(cell=>!isBlankValue(cell)))}function errorMessage2(error){return error instanceof Error?error.message:String(error)}function readUsedRangeMatrix(sheet){try{const usedRange=sheet.UsedRange;
if(!usedRange){throw new Error("UsedRange \u4E0D\u5B58\u5728")}const matrix=normalizeMatrix(usedRange.Value2);if(matrix.length===0||!hasAnyNonBlankRow(matrix)){
throw new Error("UsedRange \u6CA1\u6709\u53EF\u8BFB\u53D6\u7684\u6570\u636E")}const usedRangeStartRow=Number.isFinite(usedRange.Row)?usedRange.Row:void 0;if(usedRangeStartRow===
void 0){return{matrix}}return{matrix,usedRangeStartRow}}catch(error){throw new Error(`\u8BFB\u53D6\u5DE5\u4F5C\u8868\u5931\u8D25\uFF1A${sheet.Name}\uFF1B${errorMessage2(
error)}`)}}function readSheetTable(sheet,requiredHeaders,minMatchCount,maxScanRows){const{matrix,usedRangeStartRow}=readUsedRangeMatrix(sheet);return parseTableFromMatrix(
matrix,requiredHeaders,{minMatchCount,maxScanRows,usedRangeStartRow})}function isUsableSheets(value){return Boolean(value&&typeof value.Count==="number"&&typeof value.Item==="function")}function getApplication(root2=globalThis){if(!root2.
Application){throw new Error("\u5F53\u524D\u73AF\u5883\u6CA1\u6709 WPS Application \u5BF9\u8C61\uFF0C\u8BF7\u5728 WPS JS \u5B8F\u73AF\u5883\u4E2D\u8FD0\u884C\u3002")}
return root2.Application}function getSheets(app){var _a,_b,_c;const activeWorkbook=app.ActiveWorkbook;const sheets=(_c=(_b=(_a=activeWorkbook==null?void 0:activeWorkbook.
Worksheets)!=null?_a:activeWorkbook==null?void 0:activeWorkbook.Sheets)!=null?_b:app.Worksheets)!=null?_c:app.Sheets;if(!isUsableSheets(sheets)){throw new Error(
"\u5F53\u524D WPS Application \u6CA1\u6709\u53EF\u7528\u7684\u5DE5\u4F5C\u7C3F\u6216 Worksheets/Sheets \u96C6\u5408\u3002")}return sheets}function findSheetByName(sheetName,root2){
const app=getApplication(root2);const sheets=getSheets(app);for(let index=1;index<=sheets.Count;index+=1){const sheet=sheets.Item(index);if((sheet==null?void 0:
sheet.Name)===sheetName){return sheet}}return null}function getSheetByName(sheetName,root2){const sheet=findSheetByName(sheetName,root2);if(!sheet){throw new Error(
`\u627E\u4E0D\u5230\u5DE5\u4F5C\u8868\uFF1A${sheetName}`)}return sheet}function ensureSheet(sheetName,root2){const existingSheet=findSheetByName(sheetName,root2);
if(existingSheet){return existingSheet}const sheets=getSheets(getApplication(root2));if(typeof sheets.Add!=="function"){throw new Error("\u5F53\u524D\u5DE5\u4F5C\u7C3F\u4E0D\u652F\u6301\u65B0\u589E\u5DE5\u4F5C\u8868\u3002")}
const sheet=sheets.Add();sheet.Name=sheetName;return sheet}function assertPositiveInteger(value,name){if(!Number.isInteger(value)||value<=0){throw new Error(`${name} \u5FC5\u987B\u662F\u6B63\u6574\u6570\u3002`)}}function columnName(columnIndex){
assertPositiveInteger(columnIndex,"\u5217\u53F7");let remaining=columnIndex;let name="";while(remaining>0){const zeroBasedOffset=(remaining-1)%26;name=String.fromCharCode(
65+zeroBasedOffset)+name;remaining=Math.floor((remaining-1)/26)}return name}function normalizeChunkRows(chunkRows){if(Number.isFinite(chunkRows)&&Number.isInteger(
chunkRows)&&chunkRows>0){return chunkRows}return WRITE_CHUNK_ROWS}function matrixWidth(values){return values.reduce((width,row)=>Math.max(width,row.length),0)}function assignRangeValue(range,value){
range.Value2=value}function clearRange(sheet,address){const range=sheet.Range(address);if(typeof range.ClearContents!=="function"){throw new Error(`\u6E05\u7A7A\u533A\u57DF\u5931\u8D25\uFF1A${sheet.
Name}!${address} \u4E0D\u652F\u6301 ClearContents\u3002`)}range.ClearContents()}function errorMessage3(error){return error instanceof Error?error.message:String(
error)}function rangeAddress(startRow,startCol,rowCount,colCount){assertPositiveInteger(startRow,"\u8D77\u59CB\u884C\u53F7");assertPositiveInteger(startCol,"\u8D77\u59CB\u5217\
\u53F7");assertPositiveInteger(rowCount,"\u884C\u6570");assertPositiveInteger(colCount,"\u5217\u6570");const endRow=startRow+rowCount-1;const endCol=startCol+colCount-
1;return`${columnName(startCol)}${startRow}:${columnName(endCol)}${endRow}`}function writeMatrixBulkOrChunks(sheet,startRow,startCol,values,chunkRows=WRITE_CHUNK_ROWS){
if(values.length===0){return}const width=matrixWidth(values);if(width===0){return}const address=rangeAddress(startRow,startCol,values.length,width);try{assignRangeValue(
sheet.Range(address),values);return}catch(fullWriteError){const safeChunkRows=normalizeChunkRows(chunkRows);for(let rowOffset=0;rowOffset<values.length;rowOffset+=
safeChunkRows){const chunk=values.slice(rowOffset,rowOffset+safeChunkRows);const chunkWidth=matrixWidth(chunk);if(chunkWidth===0){continue}const chunkAddress=rangeAddress(
startRow+rowOffset,startCol,chunk.length,chunkWidth);try{assignRangeValue(sheet.Range(chunkAddress),chunk)}catch(chunkWriteError){const chunkNumber=Math.floor(rowOffset/
safeChunkRows)+1;throw new Error(`\u6574\u5757\u5199\u5165\u5931\u8D25\uFF1A${address}\uFF1B${errorMessage3(fullWriteError)}\u3002\u5206\u5757\u5199\u5165\u5931\u8D25\uFF1A\u7B2C ${chunkNumber}\
 \u5757 ${chunkAddress}\uFF1B${errorMessage3(chunkWriteError)}`)}}}}function clearQueryOutput(sheet){clearRange(sheet,`A8:Q${MAX_OUTPUT_CLEAR_ROW}`)}function clearPrecheckOutput(sheet){
clearRange(sheet,`A1:H${MAX_PRECHECK_CLEAR_ROW}`)}function clearDiagnosticsOutput(sheet){clearRange(sheet,`A1:G${MAX_DIAGNOSTICS_CLEAR_ROW}`)}function setupQueryPanel(root2){const sheet=ensureSheet(SHEET_NAMES.panel,root2);writeMatrixBulkOrChunks(sheet,1,1,[["\u62A5\u5E9F\u5DEE\u5F02\u67E5\u8BE2"],["\u516C\
\u53F8\u7B80\u79F0"],["\u4E00\u7EA7\u90E8\u95E8"],["\u4E8C\u7EA7\u90E8\u95E8"],["\u5F00\u59CB\u65E5\u671F"],["\u7ED3\u675F\u65E5\u671F"],["\u8FD0\u884C\u51FD\u6570"]],
WRITE_CHUNK_ROWS);writeMatrixBulkOrChunks(sheet,7,2,[["runScrapVarianceQuery"]],WRITE_CHUNK_ROWS);return sheet}function errorMessage4(error){return error instanceof Error?error.message:String(error)}function readRangeValue(range){if(range.Value2!==void 0){return range.Value2}
return range.Value}function normalizePanelDateValue(value){if(value===null||value===void 0||value===0||normalizeText(value)===""){return""}return value}function panelFilterValues(rawValue){
return normalizeMatrix(rawValue).flat().slice(0,5)}function readPanelFilters(panelRange){const values=panelFilterValues(readRangeValue(panelRange));return parseFilters(
{company:values[0],dept1:values[1],dept2:values[2],startDate:normalizePanelDateValue(values[3]),endDate:normalizePanelDateValue(values[4])})}function assertQueryOutputLimit(summaryRowCount,detailRowCount){
const plannedRows=1+summaryRowCount+1+detailRowCount;const lastOutputRow=8+plannedRows-1;if(lastOutputRow>MAX_OUTPUT_CLEAR_ROW){throw new Error(`\u67E5\u8BE2\u7ED3\u679C\u9700\u8981\u5199\u5230\u7B2C ${lastOutputRow}\
 \u884C\uFF0C\u8D85\u8FC7\u5F53\u524D\u6E05\u7406\u4E0A\u9650 MAX_OUTPUT_CLEAR_ROW=${MAX_OUTPUT_CLEAR_ROW}\u3002\u8BF7\u8C03\u6574 MAX_OUTPUT_CLEAR_ROW \u540E\u91CD\u65B0\u8FD0\u884C\u3002`)}}
function safeWriteQueryError(message,root2){try{const panel=setupQueryPanel(root2);clearQueryOutput(panel);writeMatrixBulkOrChunks(panel,8,1,[["\u9519\u8BEF",message]],
WRITE_CHUNK_ROWS)}catch(writeError){throw new Error(`\u67E5\u8BE2\u6267\u884C\u5931\u8D25\uFF1A${message}\uFF1B\u9519\u8BEF\u4FE1\u606F\u5199\u5165\u4E5F\u5931\u8D25\uFF1A${errorMessage4(
writeError)}`)}}function runScrapVarianceQuery(root2){try{const panel=setupQueryPanel(root2);const filters=readPanelFilters(panel.Range("B2:B6"));const oaSheet=getSheetByName(
SHEET_NAMES.oa,root2);const erpSheet=getSheetByName(SHEET_NAMES.erp,root2);const oaTable=readSheetTable(oaSheet,[...OA_REQUIRED_HEADERS],MIN_OA_HEADER_MATCH_COUNT,
MAX_HEADER_SCAN_ROWS);const erpTable=readSheetTable(erpSheet,[...ERP_REQUIRED_HEADERS],MIN_ERP_HEADER_MATCH_COUNT,MAX_HEADER_SCAN_ROWS);const pipeline=runQueryCorePipeline(
oaTable.rows,erpTable.rows,filters);if(pipeline.oaGroupedRows.size===0&&pipeline.erpOnlyRows.size===0){clearQueryOutput(panel);writeMatrixBulkOrChunks(panel,8,1,
[["\u67E5\u8BE2\u6761\u4EF6\u6CA1\u6709\u5339\u914D\u5230 OA \u6570\u636E\u3002"]],WRITE_CHUNK_ROWS);return}assertQueryOutputLimit(pipeline.summaryValues.length,
pipeline.detailValues.length);clearQueryOutput(panel);writeMatrixBulkOrChunks(panel,8,1,[["\u6C47\u603B\u5DEE\u5F02"]],WRITE_CHUNK_ROWS);writeMatrixBulkOrChunks(
panel,9,1,pipeline.summaryValues,WRITE_CHUNK_ROWS);const detailTitleRow=9+pipeline.summaryValues.length;writeMatrixBulkOrChunks(panel,detailTitleRow,1,[["\u660E\u7EC6\u5DEE\u5F02"]],
WRITE_CHUNK_ROWS);writeMatrixBulkOrChunks(panel,detailTitleRow+1,1,pipeline.detailValues,WRITE_CHUNK_ROWS)}catch(error){safeWriteQueryError(errorMessage4(error),
root2)}}function errorMessage5(error){return error instanceof Error?error.message:String(error)}function capabilityRows(capabilities){return capabilities.map(capability2=>[
"\u8FD0\u884C\u65F6\u80FD\u529B",capability2.name,NOT_APPLICABLE,NOT_APPLICABLE,NOT_APPLICABLE,NOT_APPLICABLE,capability2.note])}function metricRows(stages){return stages.
map(stage=>["\u9636\u6BB5\u8017\u65F6",stage.name,stage.inputRows,stage.outputRows,stage.timeMs,stage.heapDeltaMb,stage.note])}function writeDiagnosticsRows(sheet,rows){
clearDiagnosticsOutput(sheet);writeMatrixBulkOrChunks(sheet,1,1,rows,WRITE_CHUNK_ROWS)}function writeDiagnosticsError(root2,message){const sheet=ensureSheet(SHEET_NAMES.
performanceDiagnostics,root2);writeDiagnosticsRows(sheet,[[...DIAGNOSTICS_HEADERS],["\u9519\u8BEF","performance_diagnostics",NOT_APPLICABLE,NOT_APPLICABLE,NOT_APPLICABLE,
NOT_APPLICABLE,message]])}function runPerformanceDiagnostics(root2){try{const diagnosticsSheet=ensureSheet(SHEET_NAMES.performanceDiagnostics,root2);const metrics=createMetricsRecorder(
root2!=null?root2:globalThis);const capabilities=probeRuntimeCapabilities(root2!=null?root2:globalThis,globalThis);const panel=getSheetByName(SHEET_NAMES.panel,
root2);const oaSheet=getSheetByName(SHEET_NAMES.oa,root2);const erpSheet=getSheetByName(SHEET_NAMES.erp,root2);const filters=metrics.measure("read_filters",{inputRows:5,
outputRows:5},()=>readPanelFilters(panel.Range("B2:B6")));const oaUsedRange=metrics.measure("read_oa_used_range",{outputRows:value=>value.matrix.length},()=>readUsedRangeMatrix(
oaSheet));const oaTable=metrics.measure("parse_oa_table",{inputRows:oaUsedRange.matrix.length,outputRows:value=>value.rows.length},()=>parseTableFromMatrix(oaUsedRange.
matrix,[...OA_REQUIRED_HEADERS],{minMatchCount:MIN_OA_HEADER_MATCH_COUNT,maxScanRows:MAX_HEADER_SCAN_ROWS,usedRangeStartRow:oaUsedRange.usedRangeStartRow}));const erpUsedRange=metrics.
measure("read_erp_used_range",{outputRows:value=>value.matrix.length},()=>readUsedRangeMatrix(erpSheet));const erpTable=metrics.measure("parse_erp_table",{inputRows:erpUsedRange.
matrix.length,outputRows:value=>value.rows.length},()=>parseTableFromMatrix(erpUsedRange.matrix,[...ERP_REQUIRED_HEADERS],{minMatchCount:MIN_ERP_HEADER_MATCH_COUNT,
maxScanRows:MAX_HEADER_SCAN_ROWS,usedRangeStartRow:erpUsedRange.usedRangeStartRow}));const result=runQueryCorePipeline(oaTable.rows,erpTable.rows,filters,metrics);
const rows=[[...DIAGNOSTICS_HEADERS],...capabilityRows(capabilities),...metricRows(metrics.stages),["\u7ED3\u679C\u89C4\u6A21","result_rows",oaTable.rows.length+
erpTable.rows.length,result.detailRows.length+result.summaryRows.length,NOT_APPLICABLE,NOT_APPLICABLE,`OA\u805A\u5408=${result.oaGroupedRows.size}\uFF1BERP\u5339\u914D\u805A\u5408=${result.
erpRowsForOa.size}\uFF1BERP-only\u805A\u5408=${result.erpOnlyRows.size}`]];const writeStageRow=rows.length+1;metrics.measure("write_diagnostics_sheet",{inputRows:rows.
length,outputRows:rows.length},()=>{writeDiagnosticsRows(diagnosticsSheet,rows);return rows.length});const writeStage=metrics.stages[metrics.stages.length-1];if(writeStage){
writeMatrixBulkOrChunks(diagnosticsSheet,writeStageRow,1,metricRows([writeStage]),WRITE_CHUNK_ROWS)}}catch(error){const originalMessage=errorMessage5(error);try{
writeDiagnosticsError(root2,originalMessage)}catch(writeError){throw new Error(`\u6027\u80FD\u8BCA\u65AD\u5931\u8D25\uFF1A${originalMessage}; \u9519\u8BEF\u4FE1\u606F\u5199\u5165\u4E5F\u5931\u8D25\uFF1A${errorMessage5(
writeError)}`)}}}var PRECHECK_RESULT_HEADERS=["\u7EA7\u522B","\u6570\u636E\u6E90","\u884C\u53F7","\u5B57\u6BB5\u540D","\u539F\u503C","\u95EE\u9898\u7C7B\u578B","\u539F\u56E0","\u5904\
\u7406\u5EFA\u8BAE"];var OA_REQUIRED_HEADERS2=["\u8868\u5355\u7F16\u53F7","\u7533\u8BF7\u65E5\u671F","\u516C\u53F8\u7B80\u79F0","\u4E00\u7EA7\u90E8\u95E8","\u4E8C\u7EA7\u90E8\u95E8",
"\u7269\u6599\u4EE3\u7801","\u7269\u6599\u540D\u79F0","\u6570\u91CF","\u5B9E\u9645\u9884\u7B97\u91D1\u989Dmx"];var ERP_REQUIRED_HEADERS2=["\u5355\u636E\u7F16\u53F7",
"\u65E5\u671F","\u6E90\u5355\u5355\u53F7","\u533A\u5206\u516C\u53F8\u7B80\u79F0","\u4E00\u7EA7\u90E8\u95E8","\u4E8C\u7EA7\u90E8\u95E8","\u7269\u6599\u7F16\u7801",
"\u7269\u6599\u540D\u79F0","\u5B9E\u53D1\u6570\u91CF","\u603B\u6210\u672C"];function getRows(table){var _a;return(_a=table==null?void 0:table.rows)!=null?_a:[]}
function hasHeader(table,fieldName){var _a;return((_a=table==null?void 0:table.headers)!=null?_a:[]).some(header=>normalizeText(header)===fieldName)}function findMissingHeaders(table,requiredHeaders){
var _a;const headerSet=new Set(((_a=table==null?void 0:table.headers)!=null?_a:[]).map(header=>normalizeText(header)).filter(Boolean));return requiredHeaders.filter(
header=>!headerSet.has(header))}function errorMessage6(error){if(error instanceof Error){return error.message}return String(error)}function buildIssue(level,source,rowNumber,fieldName,rawValue,issueType,reason,suggestion){
return{level,source,rowNumber,fieldName,rawValue:normalizeText(rawValue),issueType,reason,suggestion}}function buildHeaderDetectionIssue(source,error){const missingHeaders2=error.
missingHeaders.map(header=>normalizeText(header)).filter(Boolean);const missingText=missingHeaders2.length>0?`\u7F3A\u5931\u5B57\u6BB5\uFF1A${missingHeaders2.join(
"\u3001")}\u3002`:"";return buildIssue("\u9519\u8BEF",source,error.headerRowNumber,"\u8868\u5934",missingHeaders2.join("\u3001"),error.issueType,missingText?`${error.
message} ${missingText}`:error.message,`${missingText}\u68C0\u67E5\u8868\u5934\u6587\u5B57\u662F\u5426\u4E0E\u6A21\u677F\u5B8C\u5168\u4E00\u81F4\uFF0C\u4E0D\u8981\u5220\u9664\u3001\u91CD\u547D\u540D\u5173\u952E\u5217\uFF0C\u786E\u8BA4\u8868\u5934\u884C\u6CA1\u6709\u88AB\u5408\u5E76\u5355\u5143\u683C\u6216\u7A7A\u884C\u9519\u4F4D\u5F71\u54CD\u3002`)}
function buildSystemErrorIssue(error){return buildIssue("\u9519\u8BEF","\u7CFB\u7EDF","","","","\u9884\u9A8C\u8BC1\u6267\u884C\u5931\u8D25",errorMessage6(error),
"\u68C0\u67E5\u5DE5\u4F5C\u7C3F\u3001\u5DE5\u4F5C\u8868\u540D\u79F0\u6216\u5B8F\u8FD0\u884C\u73AF\u5883\u3002")}function buildMissingRequiredHeaderIssue(source,table,missingHeaders2,requiredCount){
var _a;return buildHeaderDetectionIssue(source,{issueType:"\u7F3A\u5C11\u5173\u952E\u5217",message:`${source} \u8868\u7F3A\u5C11\u5173\u952E\u5217\uFF1A\u7F3A\u5931 ${missingHeaders2.
length}/${requiredCount} \u4E2A\u5FC5\u9700\u5B57\u6BB5\uFF0C\u65E0\u6CD5\u7EE7\u7EED\u9884\u9A8C\u8BC1\u884C\u7EA7\u6570\u636E\u3002`,missingHeaders:missingHeaders2,
headerRowNumber:(_a=table==null?void 0:table.headerRowNumber)!=null?_a:""})}function validateDateColumn(source,rows,fieldName){var _a;const issues=[];for(const row of rows){
const rawValue=row[fieldName];try{if(isBlankValue(rawValue)){throw new Error("\u65E5\u671F\u4E0D\u80FD\u4E3A\u7A7A")}normalizeDateKey(rawValue)}catch(error){issues.
push(buildIssue("\u9519\u8BEF",source,(_a=row._rowNumber)!=null?_a:"",fieldName,rawValue,"\u65E5\u671F\u683C\u5F0F\u4E0D\u6B63\u786E",errorMessage6(error),"\u6539\u4E3A 2\
026-05-01 \u6216 2026/5/1 \u8FD9\u7C7B\u53EF\u8BC6\u522B\u65E5\u671F\u3002"))}}return issues}function validateNumberColumn(source,rows,fieldName){var _a;const issues=[];
for(const row of rows){const rawValue=row[fieldName];if(isBlankValue(rawValue)){continue}try{parseDecimal2(rawValue,fieldName)}catch(error){issues.push(buildIssue(
"\u9519\u8BEF",source,(_a=row._rowNumber)!=null?_a:"",fieldName,rawValue,"\u6570\u503C\u683C\u5F0F\u4E0D\u6B63\u786E",errorMessage6(error),"\u6539\u4E3A\u666E\u901A\u6570\u5B57\u6216\u5343\u5206\u4F4D\u6570\u5B57\uFF0C\u907F\u514D\u6DF7\u5165\u6587\u672C\u5355\
\u4F4D\u3001\u7A7A\u683C\u6216\u975E\u6CD5\u9017\u53F7\u3002"))}}return issues}function validateRequiredCell(source,rows,fieldName){var _a,_b;const issues=[];for(const row of rows){
if(!isBlankValue(row[fieldName])){continue}issues.push(buildIssue("\u9519\u8BEF",source,(_a=row._rowNumber)!=null?_a:"",fieldName,"","\u5173\u952E\u5B57\u6BB5\u4E3A\u7A7A",
`${source} \u7B2C ${String((_b=row._rowNumber)!=null?_b:"")} \u884C ${fieldName} \u4E3A\u7A7A\uFF0C\u67E5\u8BE2\u65F6\u65E0\u6CD5\u7A33\u5B9A\u5173\u8054\u6216\u6C47\u603B\u3002`,
"\u8865\u9F50\u8BE5\u5B57\u6BB5\uFF0C\u6216\u786E\u8BA4\u8BE5\u884C\u662F\u5426\u5E94\u4ECE\u539F\u59CB\u6570\u636E\u4E2D\u5220\u9664\u3002"))}return issues}function buildCompositeKey(row,fieldNames){
const parts=[];for(const fieldName of fieldNames){const value=normalizeText(row[fieldName]);if(!value){return""}parts.push(value)}return parts.join("||")}function validateDuplicateKeys(source,rows,fieldNames){
var _a,_b;const grouped=new Map;const issues=[];for(const row of rows){const key=buildCompositeKey(row,fieldNames);if(!key){continue}const rowNumbers=(_a=grouped.
get(key))!=null?_a:[];rowNumbers.push((_b=row._rowNumber)!=null?_b:"");grouped.set(key,rowNumbers)}for(const[key,rowNumbers]of grouped){if(rowNumbers.length<=1){
continue}issues.push(buildIssue("\u63D0\u9192",source,rowNumbers.join(","),fieldNames.join("+"),key.split("||").join(" + "),"\u4E1A\u52A1\u952E\u91CD\u590D",`${source}\
 \u5B58\u5728\u76F8\u540C\u4E1A\u52A1\u952E\u7684\u591A\u884C\u8BB0\u5F55\uFF0C\u67E5\u8BE2\u5B8F\u4F1A\u5148\u5408\u5E76\u540E\u6BD4\u8F83\u3002`,"\u5982\u679C\u8FD9\u4E9B\u884C\u786E\u5B9E\u662F\u62C6\u5206\u660E\u7EC6\
\uFF0C\u53EF\u4EE5\u4FDD\u7559\uFF1B\u5426\u5219\u68C0\u67E5\u662F\u5426\u91CD\u590D\u5BFC\u51FA\u3002"))}return issues}function collectOaFormNumbers(rows){const formNumbers=new Set;
for(const row of rows){const formNumber=normalizeText(row["\u8868\u5355\u7F16\u53F7"]);if(formNumber){formNumbers.add(formNumber)}}return formNumbers}function validateErpSourceFormExists(erpRows,oaFormNumbers){
var _a;const seenMissing=new Set;const issues=[];for(const row of erpRows){const sourceFormNumber=normalizeText(row["\u6E90\u5355\u5355\u53F7"]);if(!sourceFormNumber||
oaFormNumbers.has(sourceFormNumber)||seenMissing.has(sourceFormNumber)){continue}seenMissing.add(sourceFormNumber);issues.push(buildIssue("\u63D0\u9192","ERP",(_a=
row._rowNumber)!=null?_a:"","\u6E90\u5355\u5355\u53F7",sourceFormNumber,"ERP\u6E90\u5355\u672A\u5728OA\u4E2D\u627E\u5230","ERP \u6E90\u5355\u5355\u53F7\u5728 OA \u5168\u91CF\u8868\u5355\u7F16\u53F7\u4E2D\u627E\u4E0D\u5230\u3002",
"\u4F5C\u4E3A\u63D0\u9192\u8F93\u51FA\uFF0C\u8BF7\u7528 ERP \u6E90\u5355\u5355\u53F7\u56DE OA \u7CFB\u7EDF\u8865\u67E5\u3002"))}return issues}function appendValidationIfHeaderExists(issues,table,fieldName,validate){
if(!hasHeader(table,fieldName)){return}issues.push(...validate(getRows(table),fieldName))}function buildPrecheckIssues(oaTable,erpTable){const issues=[];const oaRows=getRows(
oaTable);const erpRows=getRows(erpTable);const missingHeaderIssues=[];const missingOaHeaders=findMissingHeaders(oaTable,OA_REQUIRED_HEADERS2);const missingErpHeaders=findMissingHeaders(
erpTable,ERP_REQUIRED_HEADERS2);if(missingOaHeaders.length>0){missingHeaderIssues.push(buildMissingRequiredHeaderIssue("OA",oaTable,missingOaHeaders,OA_REQUIRED_HEADERS2.
length))}if(missingErpHeaders.length>0){missingHeaderIssues.push(buildMissingRequiredHeaderIssue("ERP",erpTable,missingErpHeaders,ERP_REQUIRED_HEADERS2.length))}
if(missingHeaderIssues.length>0){return missingHeaderIssues}appendValidationIfHeaderExists(issues,oaTable,"\u7533\u8BF7\u65E5\u671F",(rows,fieldName)=>validateDateColumn(
"OA",rows,fieldName));appendValidationIfHeaderExists(issues,erpTable,"\u65E5\u671F",(rows,fieldName)=>validateDateColumn("ERP",rows,fieldName));appendValidationIfHeaderExists(
issues,oaTable,"\u6570\u91CF",(rows,fieldName)=>validateNumberColumn("OA",rows,fieldName));appendValidationIfHeaderExists(issues,oaTable,"\u5B9E\u9645\u9884\u7B97\u91D1\u989Dmx",
(rows,fieldName)=>validateNumberColumn("OA",rows,fieldName));appendValidationIfHeaderExists(issues,erpTable,"\u5B9E\u53D1\u6570\u91CF",(rows,fieldName)=>validateNumberColumn(
"ERP",rows,fieldName));appendValidationIfHeaderExists(issues,erpTable,"\u603B\u6210\u672C",(rows,fieldName)=>validateNumberColumn("ERP",rows,fieldName));appendValidationIfHeaderExists(
issues,oaTable,"\u8868\u5355\u7F16\u53F7",(rows,fieldName)=>validateRequiredCell("OA",rows,fieldName));appendValidationIfHeaderExists(issues,oaTable,"\u7269\u6599\u4EE3\u7801",
(rows,fieldName)=>validateRequiredCell("OA",rows,fieldName));appendValidationIfHeaderExists(issues,erpTable,"\u6E90\u5355\u5355\u53F7",(rows,fieldName)=>validateRequiredCell(
"ERP",rows,fieldName));appendValidationIfHeaderExists(issues,erpTable,"\u7269\u6599\u7F16\u7801",(rows,fieldName)=>validateRequiredCell("ERP",rows,fieldName));if(hasHeader(
oaTable,"\u8868\u5355\u7F16\u53F7")&&hasHeader(oaTable,"\u7269\u6599\u4EE3\u7801")){issues.push(...validateDuplicateKeys("OA",oaRows,["\u8868\u5355\u7F16\u53F7",
"\u7269\u6599\u4EE3\u7801"]))}if(hasHeader(erpTable,"\u6E90\u5355\u5355\u53F7")&&hasHeader(erpTable,"\u7269\u6599\u7F16\u7801")){issues.push(...validateDuplicateKeys(
"ERP",erpRows,["\u6E90\u5355\u5355\u53F7","\u7269\u6599\u7F16\u7801"]))}if(hasHeader(oaTable,"\u8868\u5355\u7F16\u53F7")&&hasHeader(erpTable,"\u6E90\u5355\u5355\u53F7")){
issues.push(...validateErpSourceFormExists(erpRows,collectOaFormNumbers(oaRows)))}return issues}function issueRowsToValues(issues){const values=[PRECHECK_RESULT_HEADERS];
const rows=issues!=null?issues:[];if(rows.length===0){values.push(["\u63D0\u9192","\u7CFB\u7EDF","","","","\u672A\u53D1\u73B0\u9884\u9A8C\u8BC1\u95EE\u9898","\u672A\u53D1\
\u73B0\u4F1A\u963B\u65AD\u67E5\u8BE2\u7684\u9884\u9A8C\u8BC1\u95EE\u9898\u3002","\u53EF\u4EE5\u7EE7\u7EED\u8FD0\u884C\u67E5\u8BE2\u3002"]);return values}for(const issue of rows){
values.push([issue.level,issue.source,issue.rowNumber,issue.fieldName,issue.rawValue,issue.issueType,issue.reason,issue.suggestion])}return values}function assertPrecheckOutputLimit(issueRowCount){const lastIssueRow=4+issueRowCount-1;if(lastIssueRow>MAX_PRECHECK_CLEAR_ROW){throw new Error(`\u9884\u9A8C\u8BC1\u7ED3\u679C\u9700\u8981\u5199\u5230\u7B2C ${lastIssueRow}\
 \u884C\uFF0C\u8D85\u8FC7\u5F53\u524D\u6E05\u7406\u4E0A\u9650 MAX_PRECHECK_CLEAR_ROW=${MAX_PRECHECK_CLEAR_ROW}\u3002\u8BF7\u8C03\u6574 MAX_PRECHECK_CLEAR_ROW \u540E\u91CD\u65B0\u8FD0\u884C\u3002`)}}
function writePrecheckResults(issues,root2){const sheet=ensureSheet(SHEET_NAMES.precheckResult,root2);const status=issues.length===0?"\u672A\u53D1\u73B0\u9884\u9A8C\u8BC1\u95EE\u9898":
`\u53D1\u73B0 ${issues.length} \u6761\u9884\u9A8C\u8BC1\u95EE\u9898`;const issueValues=issueRowsToValues(issues);assertPrecheckOutputLimit(issueValues.length);clearPrecheckOutput(
sheet);writeMatrixBulkOrChunks(sheet,1,1,[["\u62A5\u5E9F\u5DEE\u5F02\u9884\u9A8C\u8BC1",""],["\u72B6\u6001",status]],WRITE_CHUNK_ROWS);writeMatrixBulkOrChunks(sheet,
4,1,issueValues,WRITE_CHUNK_ROWS)}function readPrecheckTable(source,sheet,requiredHeaders,minMatchCount,headerIssues){try{return readSheetTable(sheet,requiredHeaders,
minMatchCount,MAX_HEADER_SCAN_ROWS)}catch(error){if(error instanceof HeaderDetectionError){headerIssues.push(buildHeaderDetectionIssue(source,error.result));return null}
throw error}}function runScrapVariancePrecheck(root2){let issues;try{const oaSheet=getSheetByName(SHEET_NAMES.oa,root2);const erpSheet=getSheetByName(SHEET_NAMES.
erp,root2);const headerIssues=[];const oaTable=readPrecheckTable("OA",oaSheet,[...OA_REQUIRED_HEADERS],MIN_OA_HEADER_MATCH_COUNT,headerIssues);const erpTable=readPrecheckTable(
"ERP",erpSheet,[...ERP_REQUIRED_HEADERS],MIN_ERP_HEADER_MATCH_COUNT,headerIssues);issues=headerIssues.length>0?headerIssues:buildPrecheckIssues(oaTable,erpTable)}catch(error){
issues=[buildSystemErrorIssue(error)]}writePrecheckResults(issues,root2)}function getControlId(control){var _a,_b,_c;return(_c=(_b=(_a=control.Id)!=null?_a:control.id)!=null?_b:control.ID)!=null?_c:""}function createRibbonHandlers(dependencies){
return{OnAddinLoad(ribbonUi){if(dependencies.root){dependencies.root.ScrapVarianceRibbonUi=ribbonUi}},OnAction(control){try{const controlId=getControlId(control);
switch(controlId){case"btnPrecheck":dependencies.runPrecheck();return;case"btnInitQueryPanel":dependencies.setupQueryPanel();return;case"btnRunQuery":dependencies.
runQuery();return;case"btnPerformanceDiagnostics":dependencies.runDiagnostics();return;default:throw new Error(`\u672A\u77E5\u529F\u80FD\u533A\u6309\u94AE\uFF1A${controlId}`)}}catch(error){
dependencies.reportError(error)}}}}function reportRuntimeError(error){var _a;const root2=globalThis;const message=error instanceof Error?error.message:String(error);if(typeof root2.alert==="funct\
ion"){root2.alert(message);return}if(typeof((_a=root2.console)==null?void 0:_a.error)==="function"){root2.console.error(message)}}var root=globalThis;root.ribbon=
createRibbonHandlers({root,runPrecheck:()=>runScrapVariancePrecheck(root),setupQueryPanel:()=>setupQueryPanel(root),runQuery:()=>runScrapVarianceQuery(root),runDiagnostics:()=>runPerformanceDiagnostics(
root),reportError:reportRuntimeError});})();
