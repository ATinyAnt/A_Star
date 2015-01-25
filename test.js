
function test(arr, num)
{
	var begin = 0;
	var end = arr.length;
	var mid = Math.ceil((end - begin)/2);
	while (begin <= end)
	{
		if (num < arr[mid])
		{
			end = mid - 1;
			mid = Math.ceil((end + begin)/2);
		}
		else
		{
			begin = mid + 1;
			mid = Math.ceil((end + begin)/2);
		}
	}
	arr.splice(mid, 0, num);
}

(function() {
	//var arr = [3,6,9,12,15,18];
	var arr = [];
	test(arr, 10);
	test(arr, 1);
	test(arr, 123);
	console.log("finish");
})();
